import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { SegmentsService } from '../customers/segments.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { DraftCampaignMessageDto } from './dto/draft-campaign-message.dto';
import {
  CAMPAIGN_TEMPLATE_KEY,
  MARKETING_ERROR_CODES,
} from './marketing.constants';
import { MessageStatus, Prisma } from '@prisma/client';

/**
 * Campaign builder (BE-061): resolves a segment (reusing SegmentsService,
 * BE-041) and fans out through the send gate. The quota precheck happens
 * BEFORE any message is queued — spec requires an insufficient-quota
 * campaign to be blocked atomically, not fail partway through a fan-out
 * that already reached some customers.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
    private readonly segments: SegmentsService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async create(businessId: string, dto: CreateCampaignDto) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const { members } = await this.segments.getSegment(dto.segment);
    const eligible = members.filter((m) => !m.optedOut);
    if (eligible.length === 0) {
      throw new AppException(
        MARKETING_ERROR_CODES.EMPTY_SEGMENT,
        `Segment "${dto.segment}" has no reachable (non-opted-out) customers`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const remainingQuota = business.msgQuota - business.msgUsed;
    if (eligible.length > remainingQuota) {
      throw new AppException(
        MARKETING_ERROR_CODES.QUOTA_EXCEEDED,
        `This send needs ${eligible.length} messages but only ${remainingQuota} remain this month`,
        HttpStatus.FORBIDDEN,
      );
    }

    const campaign = await this.tenantPrisma.client.campaign.create({
      data: {
        segment: dto.segment,
        templateKey: CAMPAIGN_TEMPLATE_KEY,
        body: dto.body,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      } as Prisma.CampaignUncheckedCreateInput,
    });

    let sentCount = 0;
    for (const customer of eligible) {
      const personalizedBody = dto.body.replace(
        /{{\s*customerName\s*}}/g,
        customer.name,
      );
      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: CAMPAIGN_TEMPLATE_KEY,
          variables: { body: personalizedBody },
          scheduledFor: dto.scheduledFor
            ? new Date(dto.scheduledFor)
            : undefined,
          campaignId: campaign.id,
        })
        .then(() => {
          sentCount += 1;
        })
        .catch(() => undefined);
    }

    return this.tenantPrisma.client.campaign.update({
      where: { id: campaign.id },
      data: { sentCount },
    });
  }

  list() {
    return this.tenantPrisma.client.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async report(campaignId: string) {
    const campaign = await this.tenantPrisma.client.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const counts = await this.tenantPrisma.client.message.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

    return {
      campaignId,
      segment: campaign.segment,
      sent: campaign.sentCount,
      delivered: byStatus.get(MessageStatus.delivered) ?? 0,
      read: byStatus.get(MessageStatus.read) ?? 0,
      failed: byStatus.get(MessageStatus.failed) ?? 0,
    };
  }

  /**
   * Real AI draft (Campaign Builder's "Draft it for me") — grounded in the objective/audience the
   * builder is already on and, if given, a coupon this business actually has (re-looked-up here,
   * never trusted as the client described it). Falls back to an honest unavailable message on
   * failure, same convention as `MarketingOverviewService.suggestReallocation`.
   */
  async draftMessage(
    businessId: string,
    dto: DraftCampaignMessageDto,
  ): Promise<{ body: string }> {
    let offerLine = 'No offer is attached to this campaign.';
    if (dto.couponCode) {
      const coupon = await this.tenantPrisma.client.coupon.findFirst({
        where: { businessId, code: dto.couponCode, active: true },
      });
      if (coupon) {
        offerLine =
          coupon.type === 'percentage'
            ? `A real active coupon "${coupon.code}" gives ${Number(coupon.value)}% off.`
            : `A real active coupon "${coupon.code}" gives a fixed discount of ${Number(coupon.value)}.`;
      }
    }

    const prompt = [
      `Write a short WhatsApp/email marketing message for a small business.`,
      `Objective: ${dto.objective}`,
      `Audience: ${dto.audienceLabel}`,
      offerLine,
      'Use the placeholders {{customerName}} for the customer name and {{couponCode}} for the offer code if one is attached — do not invent a price, product, or offer that was not given above.',
      'Return ONLY the message body text, 2-3 sentences, no quotes, no preamble.',
    ].join('\n');

    const body = await this.aiInfra.complete(
      businessId,
      prompt,
      0.6,
      'campaign_draft',
    );
    return { body: body.trim() };
  }
}
