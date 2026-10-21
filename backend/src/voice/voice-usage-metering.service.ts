import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';

type SpendClient = Pick<
  Prisma.TransactionClient,
  'business' | 'voiceUsageRecord'
>;

export async function voiceSpendState(
  client: SpendClient,
  businessId: string,
  now = new Date(),
) {
  const business = await client.business.findUnique({
    where: { id: businessId },
    select: { policies: true },
  });
  const limit = resolvePolicies(business).num('voice.monthlySpendCapUsd');
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const usage =
    limit === null
      ? null
      : await client.voiceUsageRecord.aggregate({
          where: {
            businessId,
            currency: 'USD',
            state: { in: ['confirmed', 'estimated'] },
            measuredAt: { gte: periodStart },
          },
          _sum: { cost: true },
        });
  const cost = Number(usage?._sum.cost ?? 0);
  return { limit, cost, periodStart, reached: limit !== null && cost >= limit };
}

/** Read-only provider evidence becomes idempotent usage; this service never charges a card. */
@Injectable()
export class VoiceUsageMeteringService {
  constructor(private readonly prisma: PrismaService) {}

  async recordProviderCall(
    callId: string,
    data: {
      duration?: string | number | null;
      price: string | null;
      price_unit: string | null;
    },
  ) {
    const call = await this.prisma.phoneCall.findUnique({
      where: { id: callId },
    });
    if (!call) return;
    const seconds = data.duration == null ? null : Number(data.duration);
    if (seconds === null || !Number.isSafeInteger(seconds) || seconds < 0)
      return;
    const price = data.price === null ? null : Math.abs(Number(data.price));
    const cost = price !== null && Number.isFinite(price) ? price : null;
    const currency =
      typeof data.price_unit === 'string' &&
      /^[A-Za-z]{3}$/.test(data.price_unit)
        ? data.price_unit.toUpperCase()
        : null;
    const eventKey = `twilio:call:${call.callSid}`;
    const measurement = {
      businessId: call.businessId,
      callId,
      eventKey,
      provider: 'twilio',
      unit:
        call.direction === 'outbound'
          ? 'outbound_provider_seconds'
          : 'inbound_provider_seconds',
      quantity: seconds,
      cost,
      currency,
      state: cost === null ? 'pending' : 'confirmed',
      evidence: {
        callSid: call.callSid,
        isTestCall: call.isTestCall,
        source: 'twilio_call_resource',
        rounding:
          'provider-reported duration; invoice rounding is not inferred',
      },
      measuredAt: call.endedAt ?? new Date(),
    };
    await this.prisma.voiceUsageRecord.upsert({
      where: { businessId_eventKey: { businessId: call.businessId, eventKey } },
      create: measurement,
      update: measurement,
    });
    await this.checkAlerts(call.businessId);
  }

  async recordProviderSms(
    businessId: string,
    messageId: string,
    providerRef: string,
    data: {
      price?: string | null;
      price_unit?: string | null;
      num_segments?: string | number | null;
      status?: string | null;
      date_sent?: string | null;
    },
    finalWithoutPrice = false,
  ) {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        businessId,
        channel: 'sms',
        status: { in: ['sent', 'delivered', 'read'] },
        providerRef,
      },
      select: { id: true },
    });
    if (!message || !/^(SM|MM)[0-9a-f]{32}$/i.test(providerRef)) return;

    const rawPrice = data.price == null ? null : Number(data.price);
    const cost =
      rawPrice !== null && Number.isFinite(rawPrice)
        ? Math.abs(rawPrice)
        : null;
    const currency =
      typeof data.price_unit === 'string' &&
      /^[A-Za-z]{3}$/.test(data.price_unit)
        ? data.price_unit.toUpperCase()
        : null;
    const quantity =
      typeof data.num_segments === 'number'
        ? data.num_segments
        : typeof data.num_segments === 'string' && data.num_segments.trim()
          ? Number(data.num_segments)
          : null;
    const hasSegments =
      quantity !== null && Number.isSafeInteger(quantity) && quantity > 0;
    const state =
      cost !== null && currency !== null
        ? 'confirmed'
        : finalWithoutPrice
          ? 'unpriced'
          : 'pending';
    const sentAt = data.date_sent ? new Date(data.date_sent) : new Date();
    const measuredAt = Number.isFinite(sentAt.getTime()) ? sentAt : new Date();
    const evidence = {
      source: 'twilio_message_resource',
      messageId,
      providerRef,
      providerStatus: data.status ?? null,
      segmentsReported: hasSegments ? quantity : null,
      providerPriceReported: data.price != null,
      providerInvoicePriceAvailable: cost !== null && currency !== null,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId,
            eventKey: `twilio:sms:${providerRef}`,
          },
        },
        update: { quantity: 1, cost, currency, state, evidence, measuredAt },
        create: {
          businessId,
          eventKey: `twilio:sms:${providerRef}`,
          provider: 'twilio',
          unit: 'outbound_sms_messages',
          quantity: 1,
          cost,
          currency,
          state,
          evidence,
          measuredAt,
        },
      });
      if (!hasSegments) return;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId,
            eventKey: `twilio:sms-segments:${providerRef}`,
          },
        },
        update: {
          quantity,
          state: 'measured',
          evidence,
          measuredAt,
        },
        create: {
          businessId,
          eventKey: `twilio:sms-segments:${providerRef}`,
          provider: 'twilio',
          unit: 'outbound_sms_segments',
          quantity,
          state: 'measured',
          evidence,
          measuredAt,
        },
      });
    });
    await this.checkAlerts(businessId);
  }

  async recordUpload(
    businessId: string,
    callSid: string,
    objectKey: string,
    bytes: number,
  ) {
    const call = await this.prisma.phoneCall.findFirst({
      where: { businessId, callSid },
      select: { id: true },
    });
    if (!call || !Number.isSafeInteger(bytes) || bytes < 0) return;
    // Object-key fingerprint gives dedupe without exposing private storage paths.
    const eventKey = `storage:upload:${createHash('sha256').update(objectKey).digest('hex')}`;
    await this.prisma.voiceUsageRecord.upsert({
      where: { businessId_eventKey: { businessId, eventKey } },
      update: {},
      create: {
        businessId,
        callId: call.id,
        eventKey,
        provider: 'storage',
        unit: 'recording_uploaded_bytes',
        quantity: bytes,
        state: 'unpriced',
        evidence: {
          source: 'successful_object_upload',
          invoiceCostAvailable: false,
        },
      },
    });
  }

  async recordTranscriptionDuration(
    businessId: string,
    callSid: string,
    objectKey: string,
    audioSeconds: number | null,
  ) {
    if (
      audioSeconds === null ||
      !Number.isFinite(audioSeconds) ||
      audioSeconds <= 0
    )
      return;
    const call = await this.prisma.phoneCall.findFirst({
      where: { businessId, callSid },
      select: { id: true },
    });
    if (!call) return;
    const fingerprint = createHash('sha256').update(objectKey).digest('hex');
    const eventKey = `transcription:audio:${fingerprint}`;
    await this.prisma.voiceUsageRecord.upsert({
      where: { businessId_eventKey: { businessId, eventKey } },
      update: {},
      create: {
        businessId,
        callId: call.id,
        eventKey,
        provider: 'openai',
        unit: 'transcription_audio_seconds',
        quantity: audioSeconds,
        state: 'unpriced',
        evidence: {
          source: 'openai_verbose_transcription_response',
          model: 'whisper-1',
          providerInvoiceCostAvailable: false,
          unitIsMeasuredInputDurationNotCost: true,
        },
      },
    });
  }

  async recordStorageRetention(
    businessId: string,
    callId: string,
    objectKey: string,
    deletedAt = new Date(),
  ) {
    const fingerprint = createHash('sha256').update(objectKey).digest('hex');
    const upload = await this.prisma.voiceUsageRecord.findUnique({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `storage:upload:${fingerprint}`,
        },
      },
      select: { quantity: true, measuredAt: true },
    });
    if (!upload || deletedAt < upload.measuredAt) return;
    const elapsedMilliseconds =
      deletedAt.getTime() - upload.measuredAt.getTime();
    const byteDays = new Prisma.Decimal(upload.quantity.toString())
      .mul(elapsedMilliseconds)
      .div(86_400_000);
    await this.prisma.voiceUsageRecord.upsert({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `storage:byte-days:${fingerprint}`,
        },
      },
      update: {},
      create: {
        businessId,
        callId,
        eventKey: `storage:byte-days:${fingerprint}`,
        provider: 'storage',
        unit: 'recording_storage_byte_days',
        quantity: byteDays,
        state: 'unpriced',
        measuredAt: deletedAt,
        evidence: {
          source: 'confirmed_upload_to_successful_retention_deletion',
          uploadedBytes: upload.quantity.toString(),
          storedFrom: upload.measuredAt.toISOString(),
          deletedAt: deletedAt.toISOString(),
          providerInvoiceCostAvailable: false,
        },
      },
    });
  }

  async summary(businessId: string) {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [units, currencies, pending, state] = await Promise.all([
      this.prisma.voiceUsageRecord.groupBy({
        by: ['unit', 'state'],
        where: {
          businessId,
          provider: { not: 'noxtill' },
          measuredAt: { gte: periodStart },
        },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.voiceUsageRecord.groupBy({
        by: ['currency', 'state'],
        where: {
          businessId,
          currency: { not: null },
          cost: { not: null },
          measuredAt: { gte: periodStart },
        },
        _sum: { cost: true },
      }),
      this.prisma.voiceUsageRecord.count({
        where: {
          businessId,
          provider: { not: 'noxtill' },
          state: { in: ['pending', 'unpriced'] },
          measuredAt: { gte: periodStart },
        },
      }),
      voiceSpendState(this.prisma, businessId, now),
    ]);
    return {
      periodStart: periodStart.toISOString(),
      measuredAt: now.toISOString(),
      units: units.map((u) => ({
        unit: u.unit,
        state: u.state,
        quantity: Number(u._sum.quantity ?? 0),
        records: u._count,
      })),
      costs: currencies.map((u) => ({
        currency: u.currency!,
        state: u.state,
        amount: Number(u._sum.cost ?? 0),
      })),
      pendingOrUnpriced: pending,
      spendCapUsd: state.limit,
      spendAgainstCapUsd: state.cost,
      warnings:
        state.limit === null
          ? []
          : [70, 90].filter((pct) => state.cost >= (state.limit! * pct) / 100),
      pricing: {
        targetGrossMarginPercent: 75,
        formula: 'fully loaded direct cost / 0.25',
        requiredPrice: null,
        reason:
          'Review server-configured selling-rate versions and usage handoffs in Billing & Subscription. Fully loaded costs and provider invoice reconciliation are still required to calculate an achieved margin.',
      },
    };
  }

  async checkAlerts(businessId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      const state = await voiceSpendState(tx, businessId);
      if (state.limit === null) return;
      const cap = state.limit;
      for (const threshold of [70, 90]) {
        if (state.cost < (state.limit * threshold) / 100) continue;
        const eventKey = `budget:${state.periodStart.toISOString().slice(0, 7)}:${state.limit}:${threshold}`;
        if (
          await tx.voiceUsageRecord.findUnique({
            where: { businessId_eventKey: { businessId, eventKey } },
          })
        )
          continue;
        await tx.voiceUsageRecord.create({
          data: {
            businessId,
            eventKey,
            provider: 'noxtill',
            unit: 'budget_warning',
            quantity: 0,
            state: 'recorded',
            evidence: {
              threshold,
              capUsd: state.limit,
              confirmedPlusEstimatedUsd: state.cost,
            },
          },
        });
        const owners = await tx.businessUser.findMany({
          where: { businessId, role: 'owner', active: true },
          select: { userId: true },
        });
        if (owners.length)
          await tx.notification.createMany({
            data: owners.map((owner) => ({
              businessId,
              userId: owner.userId,
              title: `Phone usage reached ${threshold}% of its spending cap`,
              priority: 'high',
              body: `Confirmed and estimated USD usage is $${state.cost.toFixed(2)} against a $${cap.toFixed(2)} monthly cap. Pending and unpriced usage may add cost.`,
              link: '/receptionist/settings',
            })),
          });
      }
    });
  }
}
