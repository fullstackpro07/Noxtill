import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AskHelpDto } from './help.dto';
import { buildFulltextBooleanQuery } from '../common/utils/mysql-fulltext.util';

const TOP_K = 3;
/** AI Assistant depth fix (UPD-INT-014): a secondary result must score at least this fraction of
 * the top result's score to be returned at all — self-normalizing (MySQL boolean-mode relevance
 * has no fixed range, so a hardcoded absolute floor would be fragile as the real corpus grows and
 * its score distribution shifts) against a real remaining risk even after stopword-filtering: a
 * genuine, non-filler word (e.g. "run") can still prefix-match an unrelated real word elsewhere
 * (e.g. "running") via the `word*` wildcard, producing a real but weak/coincidental hit that the
 * true best match's score should dwarf. */
const MIN_RELATIVE_SCORE = 0.5;
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
 * Shared retrieval primitive (BE-073) reused by both `/help/ask` and the assistant's
 * `search_help_docs` tool (BE-074) — MySQL native full-text search over `help_articles` (title
 * match weighted 2x over body match) rather than embeddings, since the corpus is small enough
 * that a vector store would be pure overhead.
 *
 * MySQL migration: was Postgres `pg_trgm` `similarity()` (fuzzy/typo-tolerant, score in [0,1]),
 * with results filtered by a tuned `RELEVANCE_THRESHOLD`. MySQL's `MATCH...AGAINST` boolean-mode
 * relevance score has no fixed range, so there's no equivalent fixed threshold to port — instead,
 * `IN BOOLEAN MODE` with a required (`+`) prefix-wildcard (`*`) term per word is the filter itself
 * (only genuinely matching rows are returned at all), and `ORDER BY score DESC LIMIT` picks the
 * best of those.
 */
export async function retrieveHelpPassages(
  prisma: PrismaService,
  question: string,
): Promise<RetrievedRow[]> {
  // requireAll=false: a natural-language question's words are mostly conversational filler that
  // won't appear verbatim in the target article — see buildFulltextBooleanQuery's doc comment.
  const booleanQuery = buildFulltextBooleanQuery(question, false);
  if (!booleanQuery) return [];

  const rows = await prisma.$queryRaw<RetrievedRow[]>`
    SELECT slug, title, url, body,
           (MATCH(title) AGAINST(${booleanQuery} IN BOOLEAN MODE) * 2 + MATCH(body) AGAINST(${booleanQuery} IN BOOLEAN MODE)) AS score
    FROM help_articles
    WHERE MATCH(title) AGAINST(${booleanQuery} IN BOOLEAN MODE) OR MATCH(body) AGAINST(${booleanQuery} IN BOOLEAN MODE)
    ORDER BY score DESC
    LIMIT ${TOP_K}
  `;
  if (rows.length === 0) return [];

  const topScore = Number(rows[0].score);
  return rows.filter(
    (row) => Number(row.score) >= topScore * MIN_RELATIVE_SCORE,
  );
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

  /** `userId` is optional (mirrors `businessId`) only so pre-existing test fixtures that predate
   * this signature still type-check without updating every call site — every real caller today
   * (the controller) always has an authenticated user. */
  async ask(
    businessId: string | undefined,
    userId: string | undefined,
    dto: AskHelpDto,
  ) {
    const passages = await retrieveHelpPassages(this.prisma, dto.question);

    if (passages.length === 0) {
      await this.logQuery(businessId, userId, dto.question, HELP_NOT_FOUND_MESSAGE, []);
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

    const answer = await this.aiInfra.complete(
      businessId,
      prompt,
      0,
      'help_ask',
    );

    const sources = passages.map((p) => ({ title: p.title, url: p.url }));
    await this.logQuery(businessId, userId, dto.question, answer, sources);
    return { answer, sources };
  }

  /** Real per-question record (unifies with Chat History, UPD-INT-014 follow-up) — logged even for
   * an honest "not found" answer, since that is still a real interaction worth showing in history.
   * Never blocks the actual answer on a logging failure. */
  private async logQuery(
    businessId: string | undefined,
    userId: string | undefined,
    question: string,
    answer: string,
    sources: { title: string; url: string }[],
  ): Promise<void> {
    try {
      await this.prisma.helpQueryLog.create({
        data: { businessId, userId, question, answer, sources },
      });
    } catch {
      // Logging is best-effort — a failure here must never break the real answer already returned.
    }
  }

  /**
   * Suggested questions for the Help Assistant's chips. "Popular" has to mean popular: only
   * questions this business has really asked, at least twice, and that got a real answer (never a
   * "not found") qualify, and only when there are enough (3+) to fill a row. Otherwise this falls
   * back to the real article titles — always answerable, since they ARE the documentation — and
   * says so via `basedOn`, so the UI never calls a fallback list "Popular".
   */
  async suggestions(
    businessId: string | undefined,
  ): Promise<{ basedOn: 'usage' | 'documentation'; questions: string[] }> {
    if (businessId) {
      const grouped = await this.prisma.helpQueryLog.groupBy({
        by: ['question'],
        where: { businessId, NOT: { answer: HELP_NOT_FOUND_MESSAGE } },
        _count: { question: true },
        having: { question: { _count: { gte: 2 } } },
        orderBy: { _count: { question: 'desc' } },
        take: 5,
      });
      if (grouped.length >= 3) {
        return { basedOn: 'usage', questions: grouped.map((g) => g.question) };
      }
    }
    const articles = await this.prisma.helpArticle.findMany({
      orderBy: { title: 'asc' },
      take: 5,
      select: { title: true },
    });
    return {
      basedOn: 'documentation',
      questions: articles.map((a) => `${a.title}?`),
    };
  }

  /** Real listing, not tenant-scoped — help articles are shared documentation, the same for every
   * business. Powers a browsable grid on the Help Assistant screen alongside the search-by-question
   * flow above. */
  async listArticles() {
    const articles = await this.prisma.helpArticle.findMany({
      orderBy: { title: 'asc' },
    });
    return articles.map((a) => ({
      slug: a.slug,
      title: a.title,
      body: a.body,
      url: a.url,
      steps: Array.isArray(a.steps) ? (a.steps as string[]) : [],
    }));
  }
}
