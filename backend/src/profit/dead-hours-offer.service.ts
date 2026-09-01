import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SendGateService } from '../messaging/send-gate.service';
import { SegmentsService } from '../customers/segments.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  CAMPAIGN_TEMPLATE_KEY,
  MARKETING_ERROR_CODES,
} from '../marketing/marketing.constants';
import { ProfitService } from './profit.service';
import { Prisma } from '@prisma/client';

export interface DeadHoursOfferDraft {
  windowLabel: string;
  offerText: string;
}

/**
 * Dead-Hours Offer (UPD-BE-106) — a real AI-drafted promotion targeting this business's own
 * genuinely slowest real sales window (from `ProfitService.byTime()`, never a guessed/generic
 * slow period), gated behind an explicit approve-then-send step: `generate()` never sends
 * anything by itself, only `send()` (called from the frontend's Approve/Edit action) actually
 * reaches a customer. Reuses the exact same segment-resolve + quota-check + fan-out shape as
 * `CampaignsService.create` (can't import that service directly — `MarketingModule` already
 * imports `ProfitModule` for Marketing Assets' top-products feature, so importing back would be
 * circular) and writes into the same real `Campaign`/`Message` tables so a sent offer shows up
 * in the existing Campaigns list/analytics for free.
 */
@Injectable()
export class DeadHoursOfferService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly segments: SegmentsService,
    private readonly sendGate: SendGateService,
    private readonly profit: ProfitService,
    private readonly cls: ClsService,
  ) {}

  async generate(): Promise<DeadHoursOfferDraft> {
    const { hourly, weekday } = await this.profit.byTime();
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);

    if (hourly.length === 0) {
      return {
        windowLabel: '',
        offerText:
          'Not enough sales history yet to spot a real dead-hours window.',
      };
    }

    const deadHour = hourly.reduce((min, h) =>
      h.revenue < min.revenue ? h : min,
    );
    const deadDay = weekday.length
      ? weekday.reduce((min, w) => (w.revenue < min.revenue ? w : min))
      : null;
    const windowLabel = deadDay
      ? `${deadDay.day}s around ${this.formatHour(deadHour.hour)}`
      : `around ${this.formatHour(deadHour.hour)}`;

    const prompt =
      `This business's real sales history shows its slowest window is ${windowLabel} ` +
      '(the lowest-revenue hour/day in their own data, not a guess). Draft a short, warm ' +
      'WhatsApp promotional message (2-3 sentences) encouraging customers to visit during ' +
      'that specific window. Use {{customerName}} once for personalization. Suggest one ' +
      'concrete, modest incentive (e.g. a 10-15% discount or a small add-on) — never fabricate ' +
      'a specific product name you were not given. No preamble, return only the message text.';

    try {
      const offerText = await this.aiInfra.complete(
        businessId,
        prompt,
        0.6,
        'campaign_copy',
      );
      return { windowLabel, offerText };
    } catch {
      return {
        windowLabel,
        offerText: `AI drafting isn't available right now — write your own offer for ${windowLabel} below.`,
      };
    }
  }

  private formatHour(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  /** The explicit "Approve" step — only this method ever sends a real message. */
  async send(segment: string, offerText: string) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const { members } = await this.segments.getSegment(segment);
    const eligible = members.filter((m) => !m.optedOut);
    if (eligible.length === 0) {
      throw new AppException(
        MARKETING_ERROR_CODES.EMPTY_SEGMENT,
        `Segment "${segment}" has no reachable (non-opted-out) customers`,
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
        segment,
        templateKey: CAMPAIGN_TEMPLATE_KEY,
        body: offerText,
      } as Prisma.CampaignUncheckedCreateInput,
    });

    let sentCount = 0;
    for (const customer of eligible) {
      const personalizedBody = offerText.replace(
        /{{\s*customerName\s*}}/g,
        customer.name,
      );
      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: CAMPAIGN_TEMPLATE_KEY,
          variables: { body: personalizedBody },
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
}
