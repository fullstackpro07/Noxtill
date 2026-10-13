import { HttpStatus, Injectable } from '@nestjs/common';
import { AppointmentStatus, PhoneCallStatus, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { OverrideVoiceCallAttributionDto } from './dto/voice-tracking.dto';

const ALLOWED_WINDOWS = [7, 30, 90] as const;

/** Evidence-only call attribution. Sources are merchant-entered, never inferred from a phone call. */
@Injectable()
export class VoiceTrackingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overrideAttribution(
    businessId: string,
    actorUserId: string,
    callId: string,
    dto: OverrideVoiceCallAttributionDto,
  ) {
    const source = this.requiredText(dto.source, 'source');
    const channel = this.requiredText(dto.channel, 'channel');
    const evidence = this.requiredText(dto.evidence, 'evidence');
    const reason = this.requiredText(dto.reason, 'reason');
    const campaignId = dto.campaignId?.trim() || null;

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const call = await tx.phoneCall.findFirst({
        where: { id: callId, businessId },
        select: {
          id: true,
          attributionSource: true,
          attributionChannel: true,
          attributionCampaignId: true,
          attributionEvidence: true,
          attributionReason: true,
          attributionUpdatedAt: true,
        },
      });
      if (!call) {
        throw new AppException(
          'VOICE_CALL_NOT_FOUND',
          'The call was not found in this business.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (campaignId) {
        const campaign = await tx.adCampaign.findFirst({
          where: { id: campaignId, businessId },
          select: { id: true },
        });
        if (!campaign) {
          throw new AppException(
            'VOICE_ATTRIBUTION_CAMPAIGN_NOT_FOUND',
            'Choose an advertising campaign that belongs to this business.',
            HttpStatus.NOT_FOUND,
          );
        }
      }

      const updatedAt = new Date();
      const after = {
        source,
        channel,
        campaignId,
        evidence,
        reason,
        updatedAt: updatedAt.toISOString(),
        confidence: 'merchant-entered evidence; not provider-verified',
      };
      const before = {
        source: call.attributionSource,
        channel: call.attributionChannel,
        campaignId: call.attributionCampaignId,
        evidence: call.attributionEvidence,
        reason: call.attributionReason,
        updatedAt: call.attributionUpdatedAt?.toISOString() ?? null,
      };

      const changed = await tx.phoneCall.updateMany({
        where: { id: callId, businessId },
        data: {
          attributionSource: source,
          attributionChannel: channel,
          attributionCampaignId: campaignId,
          attributionEvidence: evidence,
          attributionReason: reason,
          attributionUpdatedAt: updatedAt,
        },
      });
      if (changed.count !== 1) {
        throw new AppException(
          'VOICE_CALL_NOT_FOUND',
          'The call was not found in this business.',
          HttpStatus.NOT_FOUND,
        );
      }

      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'voice.tracking.attribution_corrected',
          entity: 'PhoneCall',
          entityId: callId,
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
        },
      });

      return { callId, attribution: after };
    });
  }

  async overview(businessId: string, requestedDays?: string) {
    const parsedDays = Number(requestedDays);
    const days = ALLOWED_WINDOWS.includes(
      parsedDays as (typeof ALLOWED_WINDOWS)[number],
    )
      ? parsedDays
      : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = { businessId, startedAt: { gte: since } };

    const [
      line,
      callCount,
      linkedBookings,
      completedBookings,
      chargeRows,
      calls,
      manualAttributedCalls,
      campaignOptions,
    ] = await Promise.all([
      this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
        select: { phoneNumber: true, provisionedAt: true },
      }),
      this.tenantPrisma.client.phoneCall.count({ where }),
      this.tenantPrisma.client.phoneCall.count({
        where: { ...where, appointmentId: { not: null } },
      }),
      this.tenantPrisma.client.phoneCall.count({
        where: {
          ...where,
          appointment: { is: { status: AppointmentStatus.completed } },
        },
      }),
      this.tenantPrisma.client.phoneCall.groupBy({
        by: ['providerCostUnit'],
        where: {
          ...where,
          providerCost: { not: null },
          providerCostCheckedAt: { not: null },
        },
        _sum: { providerCost: true },
        _count: { _all: true },
      }),
      this.tenantPrisma.client.phoneCall.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          fromNumber: true,
          status: true,
          outcome: true,
          startedAt: true,
          endedAt: true,
          routedRuleName: true,
          attributionSource: true,
          attributionChannel: true,
          attributionCampaignId: true,
          attributionEvidence: true,
          attributionReason: true,
          attributionUpdatedAt: true,
          attributionCampaign: {
            select: { provider: true, goal: true },
          },
          appointment: {
            select: { bookingNo: true, status: true, source: true },
          },
          providerCost: true,
          providerCostUnit: true,
          providerCostCheckedAt: true,
        },
      }),
      this.tenantPrisma.client.phoneCall.count({
        where: { ...where, attributionSource: { not: null } },
      }),
      this.tenantPrisma.client.adCampaign.findMany({
        where: { businessId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: 100,
        select: { id: true, provider: true, goal: true, status: true },
      }),
    ]);

    return {
      windowDays: days,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      line: line
        ? {
            phoneNumber: line.phoneNumber,
            provider: 'Twilio',
            provisionedAt: line.provisionedAt.toISOString(),
            scope: 'Shared business voice line; not campaign-specific',
          }
        : null,
      metrics: {
        inboundCalls: callCount,
        callLinkedBookings: linkedBookings,
        completedCallBookings: completedBookings,
        manualAttributedCalls,
        leads: null,
        qualifiedConversions: null,
        unknownSourceRate: null,
        campaignRevenue: null,
        providerCharges: chargeRows.map((row) => ({
          unit: row.providerCostUnit,
          amount: row._sum.providerCost?.toString() ?? '0',
          checkedCallCount: row._count._all,
        })),
      },
      calls: calls.map((call) => ({
        id: call.id,
        caller: this.maskCaller(call.fromNumber),
        status: call.status,
        outcome: call.outcome,
        startedAt: call.startedAt.toISOString(),
        durationSeconds: call.endedAt
          ? Math.max(
              0,
              Math.floor(
                (call.endedAt.getTime() - call.startedAt.getTime()) / 1000,
              ),
            )
          : null,
        routingRule: call.routedRuleName,
        marketingAttribution: call.attributionSource
          ? {
              source: call.attributionSource,
              channel: call.attributionChannel,
              campaignId: call.attributionCampaignId,
              campaignLabel: call.attributionCampaign
                ? `${call.attributionCampaign.provider} · ${call.attributionCampaign.goal}`
                : null,
              evidence: call.attributionEvidence,
              reason: call.attributionReason,
              updatedAt: call.attributionUpdatedAt?.toISOString() ?? null,
              confidence: 'Merchant-entered evidence; not provider-verified',
            }
          : null,
        booking: call.appointment
          ? {
              bookingNo: call.appointment.bookingNo,
              status: call.appointment.status,
              source: call.appointment.source,
            }
          : null,
        providerCharge:
          call.providerCostCheckedAt && call.providerCost
            ? {
                amount: call.providerCost.toString(),
                unit: call.providerCostUnit,
                checkedAt: call.providerCostCheckedAt.toISOString(),
              }
            : null,
      })),
      campaignOptions,
      limitations: {
        marketingAttribution:
          'Automatic click/session/UTM imports are not configured. Only merchant-entered source corrections with evidence are shown; unknown calls are not assigned to a campaign.',
        campaignRevenue:
          'Not available: a phone call can link to its canonical booking, but there is no call-to-order/revenue link.',
        leads:
          'Not tracked: caller records are not automatically counted as qualified leads.',
        trackingNumbers: line
          ? 'This business has one shared Twilio voice line, not campaign-specific tracking numbers.'
          : 'Not configured: this business has no provisioned Twilio voice line or campaign-specific tracking numbers.',
        providerCharges: chargeRows.length
          ? 'Only charges returned and price-checked by the telephony provider are shown; no estimate is added.'
          : 'Not available: no provider-priced calls are recorded in this date window.',
      },
      phoneCallStatuses: Object.values(PhoneCallStatus),
    };
  }

  private maskCaller(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
  }

  private requiredText(value: string, field: string): string {
    const normalized = value.trim();
    if (normalized.length < 2) {
      throw new AppException(
        'VOICE_ATTRIBUTION_EVIDENCE_REQUIRED',
        `${field} must contain at least 2 non-space characters.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized;
  }
}
