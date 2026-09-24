import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../messaging/channels/email.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export type WeeklyReportResult =
  | { sent: true; recipient: string }
  | { sent: false; reason: 'no_recipient' | 'send_failed'; message: string };

/**
 * The weekly Competitive Insights email, sent to the address the owner set in Competitive Settings
 * (`weeklyReportRecipient`). Every line is computed from real rows — the last 7 days of Google
 * rating snapshots, observations the owner recorded, and currently open gaps. Runs outside any
 * request context (also called from the "send now" endpoint), so it uses `PrismaService` with an
 * explicit `businessId`, same as the other competitive jobs.
 */
@Injectable()
export class CompetitiveWeeklyReportService {
  private readonly logger = new Logger(CompetitiveWeeklyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async build(businessId: string, now = new Date()): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true, currency: true },
    });
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const competitors = await this.prisma.competitor.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    const lines: string[] = [];
    for (const c of competitors) {
      const [latest, before] = await Promise.all([
        this.prisma.competitorSnapshot.findFirst({
          where: { competitorId: c.id },
          orderBy: { capturedAt: 'desc' },
        }),
        this.prisma.competitorSnapshot.findFirst({
          where: { competitorId: c.id, capturedAt: { lte: weekAgo } },
          orderBy: { capturedAt: 'desc' },
        }),
      ]);
      if (!latest) {
        lines.push(`- ${c.name}: no rating read yet`);
        continue;
      }
      const rating = Number(latest.rating);
      let change = 'no earlier snapshot to compare with';
      if (before) {
        const dRating = Math.round((rating - Number(before.rating)) * 10) / 10;
        const dReviews = latest.reviewsCount - before.reviewsCount;
        change =
          dRating === 0 && dReviews === 0
            ? 'no change in the last 7 days'
            : `${dRating > 0 ? '+' : ''}${dRating.toFixed(1)} rating, ${dReviews > 0 ? '+' : ''}${dReviews} reviews in the last 7 days`;
      }
      lines.push(
        `- ${c.name}: ${rating.toFixed(1)} from ${latest.reviewsCount} reviews (${change})`,
      );
    }

    const observations = await this.prisma.competitorObservation.findMany({
      where: { businessId, observedAt: { gte: weekAgo } },
      include: { competitor: { select: { name: true } } },
      orderBy: { observedAt: 'desc' },
    });
    const observed = observations.map((o) => {
      const detail =
        o.amount != null
          ? `${business.currency} ${Number(o.amount).toLocaleString('en-US')}`
          : o.kind === 'offer' && o.endsAt
            ? `ends ${o.endsAt.toISOString().slice(0, 10)}`
            : 'no price published';
      return `- ${o.competitor.name} (${o.kind}): ${o.label} — ${detail}`;
    });

    const gaps = await this.prisma.competitiveOpportunity.findMany({
      where: { businessId, dismissed: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return [
      `Competitive insights for ${business.name}`,
      `Week ending ${now.toISOString().slice(0, 10)}`,
      '',
      'Competitor ratings',
      ...(lines.length
        ? lines
        : ['- You are not watching any competitors yet']),
      '',
      'Prices, services and offers you recorded this week',
      ...(observed.length ? observed : ['- Nothing recorded this week']),
      '',
      `Open gaps (${gaps.length})`,
      ...(gaps.length
        ? gaps.map(
            (g) =>
              `- ${g.evidence}${g.recommendation ? ` → ${g.recommendation}` : ''}`,
          )
        : ['- None']),
      '',
      'Only public information and things you recorded yourself are included. Change or stop this email in Competitive Insights → Settings.',
    ].join('\n');
  }

  async sendForBusiness(businessId: string): Promise<WeeklyReportResult> {
    const settings = await this.prisma.competitiveSettings.findUnique({
      where: { businessId },
    });
    const recipient = settings?.weeklyReportRecipient;
    if (!recipient) {
      return {
        sent: false,
        reason: 'no_recipient',
        message: 'No weekly report recipient is set in Competitive Settings.',
      };
    }

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { locale: true },
    });
    try {
      await this.email.send({
        to: recipient,
        text: await this.build(businessId),
        templateKey: 'competitive_weekly_report',
        locale: business.locale,
        businessId,
      });
      return { sent: true, recipient };
    } catch (error) {
      this.logger.warn(
        `Competitive weekly report for business ${businessId} failed: ${(error as Error).message}`,
      );
      return {
        sent: false,
        reason: 'send_failed',
        message: 'The email provider rejected the message.',
      };
    }
  }
}
