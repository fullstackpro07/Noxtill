import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { SegmentsService } from '../../customers/segments.service';
import { AppException } from '../../common/filters/app.exception';
import { signPayload, verifyPayload } from '../signed-token.util';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { EmailEventType, Prisma } from '@prisma/client';

interface UnsubscribePayload {
  email: string;
  businessId: string;
  campaignId: string;
}

/**
 * Marketing bulk email (BE-083) — mirrors `marketing/campaigns.service.ts`'s real segment-fan-out
 * pattern, but sends via Resend directly (same shape as the transactional
 * `messaging/channels/email.service.ts`) instead of the WhatsApp/SMS send-gate, since email
 * marketing has its own quota-free suppression-list model rather than the messaging quota.
 */
@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly segments: SegmentsService,
    private readonly config: ConfigService,
  ) {}

  async create(businessId: string, dto: CreateEmailCampaignDto) {
    const { members } = await this.segments.getSegment(dto.segment);

    const campaign = await this.tenantPrisma.client.emailCampaign.create({
      data: {
        subject: dto.subject,
        body: dto.body,
        segment: dto.segment,
      } as Prisma.EmailCampaignUncheckedCreateInput,
    });

    const eligible: { email: string }[] = [];
    for (const member of members) {
      if (!member.email) continue;
      const suppressed = await this.isSuppressed(businessId, member.email);
      if (!suppressed) eligible.push({ email: member.email });
    }

    let sentCount = 0;
    for (const recipient of eligible) {
      const sent = await this.sendOne(
        businessId,
        campaign.id,
        dto,
        recipient.email,
      );
      if (sent) sentCount += 1;
    }

    return this.tenantPrisma.client.emailCampaign.update({
      where: { id: campaign.id },
      data: { sentCount },
    });
  }

  list(businessId: string) {
    return this.tenantPrisma.client.emailCampaign.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async funnel(businessId: string, campaignId: string) {
    const campaign = await this.tenantPrisma.client.emailCampaign.findFirst({
      where: { id: campaignId, businessId },
    });
    if (!campaign) {
      throw new AppException(
        'EMAIL_CAMPAIGN_NOT_FOUND',
        'Email campaign not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const counts = await this.tenantPrisma.client.emailEvent.groupBy({
      by: ['type'],
      where: { emailCampaignId: campaignId },
      _count: { _all: true },
    });
    const byType = new Map(counts.map((c) => [c.type, c._count._all]));

    return {
      campaignId,
      sent: byType.get(EmailEventType.sent) ?? 0,
      delivered: byType.get(EmailEventType.delivered) ?? 0,
      opened: byType.get(EmailEventType.open) ?? 0,
      clicked: byType.get(EmailEventType.click) ?? 0,
      unsubscribed: byType.get(EmailEventType.unsub) ?? 0,
    };
  }

  async listHealth(businessId: string) {
    const [subscribedCustomers, unsubscribed] = await Promise.all([
      this.tenantPrisma.client.customer.count({
        where: { businessId, email: { not: null }, optedOut: false },
      }),
      this.tenantPrisma.client.emailEvent.count({
        where: { type: EmailEventType.unsub, emailCampaign: { businessId } },
      }),
    ]);
    // Bounces are recorded by the email webhook (see WebhookEventsProcessor.handleEmailEvent).
    const bounced = await this.tenantPrisma.client.emailEvent.count({
      where: { type: EmailEventType.bounce, emailCampaign: { businessId } },
    });
    return { subscribed: subscribedCustomers, unsubscribed, bounced };
  }

  /** Verifies a signed unsubscribe link and records the suppression. Public — no auth available at this point. */
  async unsubscribe(token: string): Promise<{ ok: boolean }> {
    const payload = verifyPayload<UnsubscribePayload>(
      token,
      this.unsubscribeSecret(),
    );
    if (!payload) {
      throw new AppException(
        'INVALID_UNSUBSCRIBE_TOKEN',
        'This unsubscribe link is invalid or has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.tenantPrisma.client.emailEvent.create({
      data: {
        emailCampaignId: payload.campaignId,
        recipient: payload.email,
        type: EmailEventType.unsub,
      },
    });
    return { ok: true };
  }

  private async isSuppressed(
    businessId: string,
    email: string,
  ): Promise<boolean> {
    const priorUnsub = await this.tenantPrisma.client.emailEvent.findFirst({
      where: {
        type: EmailEventType.unsub,
        recipient: email,
        emailCampaign: { businessId },
      },
    });
    return !!priorUnsub;
  }

  private async sendOne(
    businessId: string,
    campaignId: string,
    dto: CreateEmailCampaignDto,
    email: string,
  ): Promise<boolean> {
    const unsubscribeToken = signPayload<UnsubscribePayload>(
      { email, businessId, campaignId },
      this.unsubscribeSecret(),
    );
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const unsubscribeLink = `${frontendUrl}/unsubscribe?token=${unsubscribeToken}`;
    const textBody = `${dto.body}\n\n---\nUnsubscribe: ${unsubscribeLink}`;
    // An HTML part is required for the provider's open/click tracking (pixel + link rewriting).
    const htmlBody = `<div>${escapeHtml(dto.body).replace(/\r?\n/g, '<br>')}</div><hr><p style="font-size:12px;color:#666"><a href="${escapeHtml(unsubscribeLink)}">Unsubscribe</a></p>`;

    try {
      const response = await axios.post<{ id?: string }>(
        'https://api.resend.com/emails',
        {
          from: this.config.get<string>('EMAIL_FROM_ADDRESS'),
          to: email,
          subject: dto.subject,
          text: textBody,
          html: htmlBody,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.get<string>('EMAIL_PROVIDER_KEY') ?? ''}`,
          },
        },
      );
      await this.tenantPrisma.client.emailEvent.create({
        data: {
          emailCampaignId: campaignId,
          recipient: email,
          type: EmailEventType.sent,
          providerRef:
            typeof response.data?.id === 'string' ? response.data.id : null,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Email send failed for campaign ${campaignId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private unsubscribeSecret(): string {
    return this.config.get<string>('EMAIL_UNSUBSCRIBE_SECRET') ?? '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
