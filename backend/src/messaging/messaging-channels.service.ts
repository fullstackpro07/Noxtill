import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { TEMPLATE_REGISTRY } from './templates/template-registry.data';
import { UpdateChannelPriorityDto } from './dto/update-channel-priority.dto';
import { SetTemplateApprovalDto } from './dto/set-template-approval.dto';
import {
  MESSAGE_CHANNELS,
  MessageChannelValue,
  TemplateApprovalEntry,
} from './messaging-channels.constants';
import { Prisma } from '@prisma/client';

/**
 * Messages & Channels, configurable (UPD-BE-118). Two real, previously-fixed things this makes
 * configurable: `channel-resolution.util.ts`'s hardcoded fallback order, and (for the first time)
 * a per-template approval status. Per-channel "quota" is real usage this month grouped by
 * channel from the real `Message` table — `Business.msgQuota`/`.msgUsed` deliberately stay one
 * shared total (no per-channel cap is introduced), so this is disclosed as a usage breakdown, not
 * a separate enforced limit per channel.
 */
@Injectable()
export class MessagingChannelsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getSettings(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const grouped = await this.tenantPrisma.client.message.groupBy({
      by: ['channel'],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
    });
    const usageByChannel: Record<string, number> = {};
    for (const channel of MESSAGE_CHANNELS) usageByChannel[channel] = 0;
    for (const row of grouped) usageByChannel[row.channel] = row._count._all;

    const priority = this.resolvePriority(business.channelPriority);
    const approvals = (business.templateApprovals ?? {}) as unknown as Record<
      string,
      TemplateApprovalEntry
    >;

    const templates = Object.values(TEMPLATE_REGISTRY).map((def) => ({
      key: def.key,
      category: def.category,
      locales: Object.keys(def.locales),
      approval: approvals[def.key] ?? { status: 'approved' as const },
    }));

    return {
      priority,
      defaultPriority: MESSAGE_CHANNELS,
      msgQuota: business.msgQuota,
      msgUsed: business.msgUsed,
      usageByChannel,
      templates,
    };
  }

  async updatePriority(businessId: string, dto: UpdateChannelPriorityDto) {
    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { channelPriority: dto.priority as Prisma.InputJsonValue },
    });
    return this.getSettings(businessId);
  }

  async setTemplateApproval(
    businessId: string,
    templateKey: string,
    dto: SetTemplateApprovalDto,
  ) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const approvals = {
      ...((business.templateApprovals ?? {}) as unknown as Record<
        string,
        TemplateApprovalEntry
      >),
      [templateKey]: { status: dto.status, reason: dto.reason },
    };
    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { templateApprovals: approvals as Prisma.InputJsonValue },
    });
    return this.getSettings(businessId);
  }

  private resolvePriority(raw: unknown): MessageChannelValue[] {
    const stored = Array.isArray(raw) ? (raw as MessageChannelValue[]) : [];
    return stored.length > 0 ? stored : [...MESSAGE_CHANNELS];
  }
}
