import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AskHelpDto } from './help.dto';

const TOP_K = 3;
const RELEVANCE_THRESHOLD = 0.3;
export const HELP_NOT_FOUND_MESSAGE =
  "I couldn't find anything about that in the help docs — try rephrasing, or contact support.";

export interface RetrievedRow {
  slug: string;
  title: string;
  url: string;
  body: string;
  score: number;
}

/**
 * Shared retrieval primitive (BE-073) reused by both `/help/ask` and the
 * assistant's `search_help_docs` tool (BE-074) — trigram hybrid over
 * `help_articles` (title similarity weighted higher than body similarity)
 * rather than embeddings, since the corpus is small enough that a vector
 * store would be pure overhead.
 */
export async function retrieveHelpPassages(
  prisma: PrismaService,
  question: string,
): Promise<RetrievedRow[]> {
  const rows = await prisma.$queryRaw<RetrievedRow[]>`
    SELECT slug, title, url, body,
           (similarity(title, ${question}) * 2 + similarity(body, ${question})) AS score
    FROM help_articles
    ORDER BY score DESC
    LIMIT ${TOP_K}
  `;
  return rows.filter((r) => Number(r.score) > RELEVANCE_THRESHOLD);
}

/**
 * RAG help pipeline (BE-073). Claude is instructed to answer ONLY from the
 * retrieved passages and to say so honestly when nothing relevant was
 * retrieved at all, so an out-of-scope question never gets a fabricated answer.
 */
@Injectable()
export class HelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async ask(businessId: string | undefined, dto: AskHelpDto) {
    const passages = await retrieveHelpPassages(this.prisma, dto.question);

    if (passages.length === 0) {
      return { answer: HELP_NOT_FOUND_MESSAGE, sources: [] };
    }

    const passageText = passages
      .map((p, i) => `[${i + 1}] ${p.title} (${p.url})\n${p.body}`)
      .join('\n\n');

    const prompt = [
      `Answer the user's question using ONLY the passages below — never invent information not present here.`,
      `Passages:\n${passageText}`,
      `Question: "${dto.question}"`,
      'Answer in 2-4 short sentences and mention which passage number(s) you used, e.g. "(see [1])".',
      `If none of the passages actually answer the question, reply with EXACTLY: "${HELP_NOT_FOUND_MESSAGE}"`,
    ].join('\n\n');

    const answer = await this.aiInfra.complete(businessId, prompt);

    return {
      answer,
      sources: passages.map((p) => ({ title: p.title, url: p.url })),
    };
  }
}
