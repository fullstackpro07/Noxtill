import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InboxAiDraft, InboxConversation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import {
  INBOX_AI_KIND,
  INBOX_ERROR_CODES,
  INBOX_EVENT,
  MONEY_WORDS,
  THREAD_SUMMARY_MIN_MESSAGES,
  channelDef,
  mentionsAny,
} from './inbox.constants';
import { InboxFactsService } from './inbox-facts.service';
import { InboxSettingsService } from './inbox-settings.service';
import { Actor, InboxCoreService } from './inbox-core.service';
import { InboxSendService } from './inbox-send.service';

const DELAY_WORDS = [
  'tomorrow',
  'later',
  'next week',
  'delay',
  'extend',
  'extension',
  'more time',
  'discount',
  'refund',
  'cheaper',
  'waive',
];

const TONE_TEXT: Record<string, string> = {
  warm: 'Warm and short — friendly, two or three sentences at most.',
  formal: 'Formal and polite, complete sentences, no slang.',
  brief: 'Very brief — one sentence where possible.',
};

export interface DraftOutcome {
  draft: InboxAiDraft | null;
  skipped: string | null;
}

@Injectable()
export class InboxAiService {
  private readonly logger = new Logger(InboxAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiInfraService,
    private readonly facts: InboxFactsService,
    private readonly settings: InboxSettingsService,
    private readonly core: InboxCoreService,
    private readonly sender: InboxSendService,
  ) {}

  /**
   * Drafts a reply to the conversation's latest customer message. The draft is only ever stored —
   * a person sends it. With "only draft when the facts are certain" on (the default), no draft is
   * made unless at least one real record (order, delivery, credit, booking, product) backs it, and
   * the skip is logged with its reason.
   */
  async draftFor(
    conversation: InboxConversation,
    actor: Actor,
    manual: boolean,
  ): Promise<DraftOutcome> {
    const businessId = conversation.businessId;
    const s = await this.settings.get(businessId);
    const lastIn = await this.prisma.inboxMessage.findFirst({
      where: { conversationId: conversation.id, kind: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastIn)
      throw new AppException(
        INBOX_ERROR_CODES.NOTHING_TO_REPLY_TO,
        'The customer has not written anything to reply to yet.',
        HttpStatus.BAD_REQUEST,
      );

    if (!s.aiReadRecords) {
      if (manual)
        throw new AppException(
          INBOX_ERROR_CODES.AI_READ_OFF,
          'AI is not allowed to read orders, deliveries or stock (AI Actions), so it has nothing to build a reply from.',
          HttpStatus.BAD_REQUEST,
        );
      return this.skip(
        conversation,
        actor,
        'AI is not allowed to read records.',
        'read_off',
      );
    }

    const facts = await this.facts.forConversation(
      businessId,
      conversation,
      lastIn.body,
    );
    const { lines, sources } = this.facts.draftFacts(facts);
    if (
      s.aiFactsOnly &&
      lines.filter((l) => !l.startsWith('Customer name')).length === 0
    ) {
      const reason = facts.customer
        ? 'Nothing open for this customer and no product named — the answer depends on something the system does not know.'
        : 'No customer record and no product named — the answer depends on something the system does not know.';
      if (manual)
        throw new AppException(
          INBOX_ERROR_CODES.NO_FACTS,
          reason,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      return this.skip(conversation, actor, reason, 'no_facts');
    }

    const thread = await this.prisma.inboxMessage.findMany({
      where: { conversationId: conversation.id, kind: { in: ['in', 'out'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const transcript = thread
      .reverse()
      .map((m) => `${m.kind === 'in' ? 'Customer' : 'Business'}: ${m.body}`)
      .join('\n');
    const language =
      s.language === 'en'
        ? 'Always reply in English.'
        : s.language === 'ur'
          ? 'Always reply in Urdu.'
          : 'Reply in the same language the customer last wrote in.';

    const system = [
      `You draft customer replies for ${s.businessName}, sent over ${channelDef(conversation.channel).short}.`,
      `Tone: ${TONE_TEXT[s.tone] ?? TONE_TEXT.warm}`,
      language,
      'Use ONLY the facts listed below. Never invent times, prices, stock, amounts, links or promises. If the facts do not answer the question, say a team member will check and get back to them.',
      'Do not agree to payment delays, discounts or refunds — say you will confirm with the team.',
      'Output only the reply text, with no greeting labels, quotes or explanations.',
    ].join('\n');
    const prompt = `Facts from the business's records:\n${lines.map((l) => `- ${l}`).join('\n') || '- (none)'}\n\nConversation so far:\n${transcript}\n\nWrite the reply to the customer's last message.`;

    let text: string;
    try {
      const result = await this.ai.createMessage(
        businessId,
        INBOX_AI_KIND.DRAFT,
        {
          system,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          maxTokens: 400,
        },
      );
      text = (result.content.find((b) => b.type === 'text')?.text ?? '').trim();
    } catch (error) {
      const reason =
        `AI could not be reached: ${(error as Error).message}`.slice(0, 300);
      if (manual) throw error;
      return this.skip(conversation, actor, reason, 'ai_unavailable');
    }
    if (!text) {
      if (manual)
        throw new AppException(
          INBOX_ERROR_CODES.NO_FACTS,
          'AI returned an empty draft.',
          HttpStatus.BAD_GATEWAY,
        );
      return this.skip(
        conversation,
        actor,
        'AI returned an empty draft.',
        'ai_unavailable',
      );
    }

    const moneyWord = mentionsAny(lastIn.body, MONEY_WORDS);
    const delayWord = mentionsAny(lastIn.body, DELAY_WORDS);
    const needsDecision =
      !!delayWord && (!!moneyWord || (facts.customer?.outstanding ?? 0) > 0);
    const warning = needsDecision
      ? `The customer is asking about ${delayWord === 'refund' ? 'a refund' : delayWord === 'discount' || delayWord === 'cheaper' ? 'a discount' : 'paying later'}. Only someone who can manage credit (Owner and Manager by default) can send this.`
      : null;

    await this.prisma.inboxAiDraft.updateMany({
      where: { conversationId: conversation.id, status: 'pending' },
      data: { status: 'superseded' },
    });
    const draft = await this.prisma.inboxAiDraft.create({
      data: {
        businessId,
        conversationId: conversation.id,
        forMessageId: lastIn.id,
        text,
        sources: sources,
        needsDecision,
        warning,
      },
    });
    await this.core.event(businessId, INBOX_EVENT.AI_READ, {
      conversationId: conversation.id,
      detail: `Read ${sources.join(', ') || 'no records'} to answer ${conversation.contactName}`,
      data: { sources },
    });
    await this.core.event(businessId, INBOX_EVENT.AI_DRAFTED, {
      conversationId: conversation.id,
      actor,
      detail: `Drafted a reply to ${conversation.contactName}`,
      data: { draftId: draft.id, needsDecision },
    });
    return { draft, skipped: null };
  }

  private async skip(
    conversation: InboxConversation,
    actor: Actor,
    reason: string,
    /** Why: facts missing (the honest "system does not know"), AI unreachable, or reading turned off. */
    cause: 'no_facts' | 'ai_unavailable' | 'read_off',
  ): Promise<DraftOutcome> {
    await this.core.event(conversation.businessId, INBOX_EVENT.AI_SKIPPED, {
      conversationId: conversation.id,
      actor,
      detail: `No draft for ${conversation.contactName}: ${reason}`,
      data: { cause },
    });
    return { draft: null, skipped: reason };
  }

  async sendDraft(
    draft: InboxAiDraft,
    conversation: InboxConversation,
    actor: Actor,
    canDecide: boolean,
    editedText?: string,
  ) {
    if (draft.status !== 'pending')
      throw new AppException(
        INBOX_ERROR_CODES.DRAFT_NOT_PENDING,
        'This draft has already been sent, discarded or replaced.',
        HttpStatus.CONFLICT,
      );
    if (draft.needsDecision && !canDecide) {
      throw new AppException(
        INBOX_ERROR_CODES.DRAFT_NEEDS_MANAGER,
        'This draft touches what the customer owes. Only someone who can manage credit can send it.',
        HttpStatus.FORBIDDEN,
      );
    }
    const edited =
      editedText !== undefined && editedText.trim() !== draft.text.trim();
    const text = edited ? editedText.trim() : draft.text;
    await this.sender.send(
      conversation,
      text,
      actor,
      edited ? 'ai_draft_edited' : 'ai_draft',
    );
    await this.prisma.inboxAiDraft.update({
      where: { id: draft.id },
      data: {
        status: edited ? 'edited' : 'sent',
        decidedByUserId: actor.userId,
        decidedByName: actor.name,
        decidedAt: new Date(),
      },
    });
    await this.core.event(
      conversation.businessId,
      edited ? INBOX_EVENT.AI_EDITED : INBOX_EVENT.AI_SENT,
      {
        conversationId: conversation.id,
        actor,
        detail: `${edited ? 'Edited and sent' : 'Approved and sent'} the drafted reply to ${conversation.contactName}`,
      },
    );
  }

  async discardDraft(
    draft: InboxAiDraft,
    conversation: InboxConversation,
    actor: Actor,
  ) {
    if (draft.status !== 'pending')
      throw new AppException(
        INBOX_ERROR_CODES.DRAFT_NOT_PENDING,
        'This draft has already been sent, discarded or replaced.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.inboxAiDraft.update({
      where: { id: draft.id },
      data: {
        status: 'discarded',
        decidedByUserId: actor.userId,
        decidedByName: actor.name,
        decidedAt: new Date(),
      },
    });
    await this.core.event(conversation.businessId, INBOX_EVENT.AI_DISCARDED, {
      conversationId: conversation.id,
      actor,
      detail: `Discarded the drafted reply to ${conversation.contactName}`,
    });
  }

  async translate(
    conversation: InboxConversation,
    text: string,
    actor: Actor,
  ): Promise<{ text: string; target: string }> {
    const s = await this.settings.get(conversation.businessId);
    const lastIn = await this.prisma.inboxMessage.findFirst({
      where: { conversationId: conversation.id, kind: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    let target: string;
    let instruction: string;
    if (s.language === 'en') {
      target = 'English';
      instruction = 'Translate the reply into English.';
    } else if (s.language === 'ur') {
      target = 'Urdu';
      instruction = 'Translate the reply into Urdu.';
    } else {
      if (!lastIn)
        throw new AppException(
          INBOX_ERROR_CODES.NOTHING_TO_REPLY_TO,
          'The customer has not written anything yet, so there is no language to match.',
          HttpStatus.BAD_REQUEST,
        );
      target = "the customer's language";
      instruction = `Translate the reply into the same language as this customer message: """${lastIn.body.slice(0, 500)}"""`;
    }
    const out = await this.ai.createMessage(
      conversation.businessId,
      INBOX_AI_KIND.TRANSLATE,
      {
        system:
          'You translate short customer-service replies. Keep names, numbers, prices and order numbers exactly as written. Output only the translated text.',
        messages: [
          { role: 'user', content: `${instruction}\n\nReply:\n${text}` },
        ],
        temperature: 0,
        maxTokens: 500,
      },
    );
    const translated = (
      out.content.find((b) => b.type === 'text')?.text ?? ''
    ).trim();
    await this.core.event(conversation.businessId, INBOX_EVENT.AI_TRANSLATED, {
      conversationId: conversation.id,
      actor,
      detail: `Translated a reply to ${conversation.contactName} into ${target}`,
    });
    return { text: translated || text, target };
  }

  /** Three-line summary for long threads — only offered when the setting is on and the thread is long. */
  async summarise(
    conversation: InboxConversation,
    actor: Actor,
  ): Promise<string | null> {
    const s = await this.settings.get(conversation.businessId);
    if (!s.aiSummarise) return null;
    const count = await this.prisma.inboxMessage.count({
      where: { conversationId: conversation.id, kind: { in: ['in', 'out'] } },
    });
    if (count < THREAD_SUMMARY_MIN_MESSAGES) return null;
    const thread = await this.prisma.inboxMessage.findMany({
      where: {
        conversationId: conversation.id,
        kind: { in: ['in', 'out', 'note'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 80,
    });
    const out = await this.ai.createMessage(
      conversation.businessId,
      INBOX_AI_KIND.SUMMARY,
      {
        system:
          'Summarise a customer conversation for a busy shop owner in exactly three short lines: what the customer wants, what has been done, what is still open. Use only what is in the conversation.',
        messages: [
          {
            role: 'user',
            content: thread
              .map(
                (m) =>
                  `${m.kind === 'in' ? 'Customer' : m.kind === 'note' ? 'Team note' : 'Business'}: ${m.body}`,
              )
              .join('\n'),
          },
        ],
        temperature: 0,
        maxTokens: 250,
      },
    );
    await this.core.event(conversation.businessId, INBOX_EVENT.AI_SUMMARISED, {
      conversationId: conversation.id,
      actor,
      detail: `Summarised the conversation with ${conversation.contactName}`,
    });
    return (
      (out.content.find((b) => b.type === 'text')?.text ?? '').trim() || null
    );
  }

  /** Best-effort auto-draft after a customer message lands; never throws into the ingest path. */
  async autoDraft(conversation: InboxConversation) {
    try {
      const s = await this.settings.get(conversation.businessId);
      if (!s.aiAutoDraft) return;
      await this.draftFor(conversation, { userId: null, name: null }, false);
    } catch (error) {
      this.logger.warn(
        `Auto-draft failed for conversation ${conversation.id}: ${(error as Error).message}`,
      );
    }
  }
}
