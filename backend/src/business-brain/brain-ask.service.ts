import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantService } from '../assistant/assistant.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  BrainContextService,
  ScopeQuery,
  money,
  plural,
} from './brain-context.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainCauseService, topicFor } from './brain-cause.service';
import { BrainReadingService } from './brain-reading.service';

/**
 * Ask Business Brain. Questions the Brain has a reading for are answered from that reading
 * (so the answer matches what the screens show). Anything else goes to the Noxtill assistant,
 * which answers with its read-only data tools. Every question and answer is kept for History.
 */
@Injectable()
export class BrainAskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: BrainContextService,
    private readonly detectors: BrainDetectorsService,
    private readonly cause: BrainCauseService,
    private readonly reading: BrainReadingService,
    private readonly assistant: AssistantService,
  ) {}

  async ask(user: AuthenticatedUser, question: string, q: ScopeQuery) {
    const text = question.trim();
    const lower = text.toLowerCase();
    const ctx = await this.context.build(user, q);
    let answer: string;
    let source: string;
    let topic: string | null = null;

    if (/(attention|urgent|worry|wrong|focus|today|priorit)/.test(lower)) {
      const x = await this.detectors.read(ctx);
      const f = (await this.reading.visibleFindings(ctx, x)).filter(
        (g) => g.kind === 'Critical' || g.kind === 'Attention',
      );
      answer = f.length
        ? `${plural(f.length, 'thing')} ${f.length === 1 ? 'needs' : 'need'} attention, most costly first:\n${f
            .slice(0, 5)
            .map((g, i) => `${i + 1}. ${g.t} — ${g.rec || g.d}`)
            .join('\n')}`
        : 'Nothing has crossed your thresholds for attention right now.';
      source = 'reading';
    } else if (
      /(business review|full review|review of the business)/.test(lower)
    ) {
      const x = await this.detectors.read(ctx);
      const f = await this.reading.visibleFindings(ctx, x);
      const signals = this.reading.signals(ctx, x, null);
      const brief = this.reading.brief(ctx, x, f, signals, 0);
      answer = brief
        .map((s) => `${s.k}\n${s.lines.map((l) => `• ${l}`).join('\n')}`)
        .join('\n\n');
      source = 'reading';
    } else if ((topic = topicFor(text))) {
      const r = await this.cause.investigate(ctx, topic as never, text);
      answer =
        r.empty || !r.reading
          ? `${r.headline}. ${r.body}`
          : `${r.headline}. ${r.body}\n\n${r.reading.mainLabel}: ${r.reading.main.t} — ${r.reading.main.d}${r.reading.contrib.length ? `\nAlso: ${r.reading.contrib.map((c) => `${c.t} (${c.share})`).join('; ')}.` : ''}${r.reading.caveat ? `\n\n${r.reading.caveat}` : ''}`;
      source = `cause:${topic}`;
    } else {
      const res = await this.assistant.chat(user.businessId, user.sub, text);
      answer = res.text || 'The assistant did not return an answer.';
      source = 'assistant';
    }

    const saved = await this.prisma.brainQuestion.create({
      data: {
        businessId: user.businessId,
        userId: user.sub,
        kind: 'ask',
        question: text,
        answer,
        source,
      },
    });
    const b = ctx.business;
    return {
      id: saved.id,
      question: text,
      answer,
      source,
      topic,
      askedAt: saved.createdAt.toISOString(),
      currency: b.currency,
      note:
        source === 'assistant'
          ? 'Answered by the Noxtill assistant using read-only lookups of your records.'
          : `Answered from Business Brain’s own reading of ${ctx.scopeLabel}.`,
    };
  }

  /** Keeps investigations started from Root Cause in History too. */
  async logWhy(
    user: AuthenticatedUser,
    question: string,
    answer: string,
    topic: string,
  ) {
    await this.prisma.brainQuestion.create({
      data: {
        businessId: user.businessId,
        userId: user.sub,
        kind: 'why',
        question,
        answer,
        source: `cause:${topic}`,
      },
    });
  }

  static money = money;
}
