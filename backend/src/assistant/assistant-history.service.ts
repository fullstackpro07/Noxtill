import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantService } from './assistant.service';
import { HISTORY_KINDS, HistoryKind, TOOL_TOPIC, VOICE_TOPIC } from './assistant-history.constants';

export interface HistoryRow {
  id: string;
  kind: HistoryKind;
  title: string;
  topic: string;
  questionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ToolCallShape {
  name: string;
}

/** Mirrors the frontend's `categoryForArticle` (slug's first hyphen-segment, capitalized) — the
 * same mechanical, honest read of real data, not an invented taxonomy, applied server-side here
 * since a `HelpQueryLog` row only carries `sources[].url`, not a category field. */
function topicFromHelpUrl(url: string | undefined): string {
  if (!url) return 'Help';
  const slug = url.split('/').filter(Boolean).pop() ?? '';
  const first = slug.split('-')[0] ?? slug;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Help';
}

function isHistoryKind(value: string): value is HistoryKind {
  return (HISTORY_KINDS as string[]).includes(value);
}

/**
 * Unified Chat History (design fix-it): the design shows one list spanning Business Chat, Help
 * Assistant and Voice Assistant, each with a real Topic/Type — this reads all three real tables
 * (`AssistantConversation`, `HelpQueryLog`, `VoiceCommandDraft`) rather than the single
 * Business-only list the screen showed before. Nothing here is a fourth table: each kind's own
 * table stays canonical, this just merges them for display.
 */
@Injectable()
export class AssistantHistoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly assistantService: AssistantService,
  ) {}

  async list(businessId: string, userId: string): Promise<HistoryRow[]> {
    const [conversations, helpQueries, voiceCommands] = await Promise.all([
      this.tenantPrisma.client.assistantConversation.findMany({
        where: { businessId, userId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.helpQueryLog.findMany({
        where: { businessId, userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.tenantPrisma.client.voiceCommandDraft.findMany({
        where: { businessId, createdByUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const businessRows: HistoryRow[] = conversations.map((c) => {
      const userMessages = c.messages.filter((m) => m.role === 'user');
      const firstToolCall = c.messages
        .filter((m) => m.role === 'assistant' && m.toolCalls)
        .flatMap((m) => (m.toolCalls as unknown as ToolCallShape[]) ?? [])[0];
      const topic = firstToolCall ? (TOOL_TOPIC[firstToolCall.name] ?? 'General') : 'General';
      return {
        id: c.id,
        kind: 'business',
        title: c.title ?? userMessages[0]?.content.slice(0, 80) ?? 'Untitled',
        topic,
        questionCount: userMessages.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    const helpRows: HistoryRow[] = helpQueries.map((h) => {
      const sources = (h.sources as unknown as { title: string; url: string }[]) ?? [];
      return {
        id: h.id,
        kind: 'help',
        title: h.question,
        topic: topicFromHelpUrl(sources[0]?.url),
        questionCount: 1,
        createdAt: h.createdAt,
        updatedAt: h.createdAt,
      };
    });

    const voiceRows: HistoryRow[] = voiceCommands.map((v) => ({
      id: v.id,
      kind: 'voice',
      title: v.humanSummary,
      topic: VOICE_TOPIC[v.action] ?? 'General',
      questionCount: 1,
      createdAt: v.createdAt,
      updatedAt: v.confirmedAt ?? v.createdAt,
    }));

    return [...businessRows, ...helpRows, ...voiceRows].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  async getDetail(businessId: string, userId: string, kind: string, id: string) {
    if (!isHistoryKind(kind)) {
      throw new NotFoundException('Unknown history entry type');
    }
    if (kind === 'business') {
      return this.assistantService.getConversation(businessId, userId, id);
    }
    if (kind === 'help') {
      const row = await this.prisma.helpQueryLog.findUnique({ where: { id } });
      if (!row || row.businessId !== businessId || row.userId !== userId) {
        throw new NotFoundException('History entry not found');
      }
      return row;
    }
    const draft = await this.tenantPrisma.client.voiceCommandDraft.findUnique({
      where: { id },
    });
    if (!draft || draft.businessId !== businessId || draft.createdByUserId !== userId) {
      throw new NotFoundException('History entry not found');
    }
    return draft;
  }

  async delete(businessId: string, userId: string, kind: string, id: string) {
    if (!isHistoryKind(kind)) {
      throw new NotFoundException('Unknown history entry type');
    }
    if (kind === 'business') {
      return this.assistantService.deleteConversation(businessId, userId, id);
    }
    if (kind === 'help') {
      const row = await this.prisma.helpQueryLog.findUnique({ where: { id } });
      if (!row || row.businessId !== businessId || row.userId !== userId) {
        throw new NotFoundException('History entry not found');
      }
      await this.prisma.helpQueryLog.delete({ where: { id } });
      return;
    }
    const draft = await this.tenantPrisma.client.voiceCommandDraft.findUnique({
      where: { id },
    });
    if (!draft || draft.businessId !== businessId || draft.createdByUserId !== userId) {
      throw new NotFoundException('History entry not found');
    }
    await this.tenantPrisma.client.voiceCommandDraft.delete({ where: { id } });
  }
}
