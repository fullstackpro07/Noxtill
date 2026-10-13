import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { TRACKING_NUMBER_ATTRIBUTION_REASON } from './voice-tracking-numbers.service';

const MAX_DAYS = 92;
const MAX_ROWS = 10_000;
const DAY_MS = 86_400_000;

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const mask = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
};

const COLUMNS = [
  'call_id',
  'started_at',
  'ended_at',
  'duration_seconds',
  'caller_masked',
  'status',
  'outcome',
  'custom_intent',
  'ai_agent',
  'ai_agent_version',
  'ivr_flow_version_id',
  'human_agent_connected',
  'staff_joined',
  'booking_no',
  'booking_status',
  'attribution_source',
  'attribution_channel',
  'attribution_basis',
  'recording_consent',
  'callback_outcome',
  'provider_cost',
  'provider_cost_unit',
] as const;

/**
 * Call Analytics export — one CSV row per saved call in the window, computed from stored call
 * facts only (no estimates). Caller numbers are masked; managers only; each export is audited.
 */
@Injectable()
export class VoiceAnalyticsExportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportCalls(businessId: string, from?: string, to?: string) {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(end.getTime() - 30 * DAY_MS);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start > end
    ) {
      throw this.invalid('Choose a valid date range.');
    }
    if (end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) {
      throw this.invalid(`Export at most ${MAX_DAYS} days at a time.`);
    }
    const calls = await this.tenantPrisma.client.phoneCall.findMany({
      where: { businessId, startedAt: { gte: start, lte: end } },
      include: {
        appointment: { select: { bookingNo: true, status: true } },
        voiceAgentVersion: {
          select: { version: true, agent: { select: { name: true } } },
        },
        humanAgentAssignments: {
          where: { status: 'connected' },
          select: { id: true },
        },
        callback: { select: { outcome: true } },
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
    });
    if (calls.length > MAX_ROWS) {
      throw this.invalid(
        `More than ${MAX_ROWS} calls in this range; export a shorter range.`,
      );
    }
    const rows = calls.map((call) => [
      call.id,
      call.startedAt,
      call.endedAt,
      call.endedAt
        ? Math.max(
            0,
            Math.round(
              (call.endedAt.getTime() - call.startedAt.getTime()) / 1000,
            ),
          )
        : null,
      mask(call.fromNumber),
      call.status,
      call.outcome,
      call.customIntentName,
      call.voiceAgentVersion?.agent.name ?? null,
      call.voiceAgentVersion?.version ?? null,
      call.ivrFlowVersionId,
      call.humanAgentAssignments.length > 0 ? 'yes' : 'no',
      call.joinedAt ? 'yes' : 'no',
      call.appointment?.bookingNo ?? null,
      call.appointment?.status ?? null,
      call.attributionSource,
      call.attributionChannel,
      call.attributionSource
        ? call.attributionReason === TRACKING_NUMBER_ATTRIBUTION_REASON
          ? 'tracking_number'
          : 'merchant_entered'
        : 'unknown',
      call.recordingConsentStatus,
      call.callback?.outcome ?? null,
      call.providerCostCheckedAt ? call.providerCost?.toString() : null,
      call.providerCostCheckedAt ? call.providerCostUnit : null,
    ]);
    const csv = [
      COLUMNS.join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
    const fromDay = start.toISOString().slice(0, 10);
    const toDay = end.toISOString().slice(0, 10);
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: businessId,
      action: 'voice.analytics.exported',
      after: {
        from: fromDay,
        to: toDay,
        rowCount: rows.length,
        callerNumbers: 'masked',
      },
    });
    return {
      filename: `calls_${fromDay}_${toDay}.csv`,
      rowCount: rows.length,
      columns: COLUMNS,
      csv,
    };
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_ANALYTICS_EXPORT_INVALID',
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
