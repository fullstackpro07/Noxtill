import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VoiceUsageRecord } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  VOICE_BILLABLE_UNITS,
  VOICE_BILLING_BATCH_SIZE,
  VoiceBillingItem,
  VoiceRateCardSource,
  VoiceSellingRate,
} from './voice-usage-billing.constants';

const measuredStates = ['confirmed', 'estimated', 'measured', 'unpriced'];
const billableUnits = new Set<string>(VOICE_BILLABLE_UNITS);
type UsageEvidence = VoiceUsageRecord & {
  call: { isTestCall: boolean } | null;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const fail = (code: string, message: string, status = HttpStatus.CONFLICT) =>
  new AppException(code, message, status);

/** Platform usage review. Rates originate on the server; no card is charged by this service. */
@Injectable()
export class VoiceUsageBillingService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.tenant.client;
  }

  private source(): VoiceRateCardSource | null {
    const raw = this.config.get<string>('VOICE_BILLING_RATE_CARD_JSON');
    if (!raw?.trim()) return null;
    try {
      const source = JSON.parse(raw) as VoiceRateCardSource;
      if (
        !source ||
        typeof source !== 'object' ||
        typeof source.sourceVersion !== 'string' ||
        !/^[A-Za-z0-9._-]{1,80}$/.test(source.sourceVersion) ||
        typeof source.sourceReference !== 'string' ||
        source.sourceReference.trim().length < 8 ||
        source.sourceReference.length > 500 ||
        !/^[A-Z]{3}$/.test(source.currency ?? '') ||
        !Number.isInteger(source.currencyMinorUnits) ||
        source.currencyMinorUnits < 0 ||
        source.currencyMinorUnits > 3 ||
        typeof source.effectiveFrom !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(source.effectiveFrom) ||
        !Number.isFinite(new Date(source.effectiveFrom).getTime()) ||
        !Array.isArray(source.rates) ||
        !source.rates.length ||
        source.rates.length > 50
      )
        throw new Error('shape');
      const seen = new Set<string>();
      const rates = source.rates
        .map((rate) => {
          const key = `${rate.provider}:${rate.unit}`;
          if (
            !billableUnits.has(key) ||
            seen.has(key) ||
            typeof rate.price !== 'string' ||
            !/^\d{1,9}(\.\d{1,6})?$/.test(rate.price) ||
            typeof rate.perQuantity !== 'string' ||
            !/^\d{1,15}(\.\d{1,6})?$/.test(rate.perQuantity) ||
            new Prisma.Decimal(rate.perQuantity).lte(0)
          )
            throw new Error('rate');
          seen.add(key);
          return {
            provider: rate.provider,
            unit: rate.unit,
            price: new Prisma.Decimal(rate.price).toString(),
            perQuantity: new Prisma.Decimal(rate.perQuantity).toString(),
          };
        })
        .sort((a, b) =>
          `${a.provider}:${a.unit}`.localeCompare(`${b.provider}:${b.unit}`),
        );
      return {
        sourceVersion: source.sourceVersion,
        sourceReference: source.sourceReference.trim(),
        currency: source.currency,
        currencyMinorUnits: source.currencyMinorUnits,
        effectiveFrom: new Date(source.effectiveFrom).toISOString(),
        rates,
      };
    } catch {
      throw fail(
        'VOICE_BILLING_RATE_CONFIG_INVALID',
        'The server voice rate card is invalid. The platform operator must correct its revision, currency, effective date and measured-unit rates.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async owner(businessId: string, userId: string) {
    if (
      !(await this.db.businessUser.findFirst({
        where: { businessId, userId, role: 'owner', active: true },
        select: { id: true },
      }))
    )
      throw fail(
        'VOICE_BILLING_OWNER_REQUIRED',
        'Only an active business owner can approve platform voice billing.',
        HttpStatus.FORBIDDEN,
      );
  }

  private reason(value: string) {
    const reason = value?.trim();
    if (!reason || reason.length < 8 || reason.length > 500)
      throw fail(
        'VOICE_BILLING_REASON_REQUIRED',
        'Enter a review reason between 8 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    return reason;
  }

  private period(month: string) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw fail(
        'VOICE_BILLING_MONTH_INVALID',
        'Choose a UTC month using YYYY-MM.',
        HttpStatus.BAD_REQUEST,
      );
    const [year, number] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, number - 1, 1));
    if (year < 1970 || year > 9998 || start > new Date())
      throw fail(
        'VOICE_BILLING_MONTH_INVALID',
        'Choose a current or past UTC month.',
        HttpStatus.BAD_REQUEST,
      );
    return { start, end: new Date(Date.UTC(year, number, 1)) };
  }

  async overview(
    businessId: string,
    month = new Date().toISOString().slice(0, 7),
  ) {
    const period = this.period(month);
    let configuredSource: VoiceRateCardSource | null = null;
    let configurationError: string | null = null;
    try {
      configuredSource = this.source();
    } catch {
      configurationError =
        'The platform operator must correct the server voice rate card.';
    }
    const [rateVersions, drafts] = await Promise.all([
      this.db.voiceBillingRateVersion.findMany({
        where: { businessId },
        orderBy: { version: 'desc' },
        take: 30,
      }),
      this.db.voiceBillingDraft.findMany({
        where: { businessId, periodStart: period.start },
        select: {
          id: true,
          total: true,
          currency: true,
          currencyMinorUnits: true,
          status: true,
          periodStart: true,
          createdAt: true,
          approvedAt: true,
          decisionReason: true,
          itemCount: true,
          rateVersion: { select: { version: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    return {
      month,
      configuredSource,
      configurationError,
      rateVersions,
      drafts: drafts.map((draft) => ({
        ...draft,
        total: draft.total.toString(),
      })),
      batchSize: VOICE_BILLING_BATCH_SIZE,
      invoiceHandoff:
        'Approved usage is available to platform Billing. Payment-provider invoice preparation is not connected yet.',
      margin:
        'Not available: provider invoices and all direct costs have not been reconciled. A configured selling rate does not prove a 75% gross margin.',
    };
  }

  async captureRates(businessId: string, actorUserId: string) {
    await this.owner(businessId, actorUserId);
    const source = this.source();
    if (!source)
      throw fail(
        'VOICE_BILLING_RATES_NOT_CONFIGURED',
        'The platform operator has not configured a voice selling rate card.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const sourceHash = hash(source);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      const previous = await tx.voiceBillingRateVersion.findFirst({
        where: { businessId, sourceVersion: source.sourceVersion },
      });
      if (previous) {
        if (previous.sourceHash !== sourceHash)
          throw fail(
            'VOICE_BILLING_RATE_REVISION_CHANGED',
            'This rate revision was already captured with different values. The platform operator must issue a new source revision.',
          );
        return previous;
      }
      const last = await tx.voiceBillingRateVersion.aggregate({
        where: { businessId },
        _max: { version: true },
      });
      const created = await tx.voiceBillingRateVersion.create({
        data: {
          businessId,
          version: (last._max.version ?? 0) + 1,
          sourceVersion: source.sourceVersion,
          sourceReference: source.sourceReference,
          sourceHash,
          currency: source.currency,
          currencyMinorUnits: source.currencyMinorUnits,
          effectiveFrom: new Date(source.effectiveFrom),
          rates: source.rates as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceBillingRateVersion',
          entityId: created.id,
          action: 'voice.billing.rates_captured',
          after: {
            version: created.version,
            sourceHash,
            sourceVersion: source.sourceVersion,
          },
        },
      });
      return created;
    });
  }

  async approveRates(
    businessId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    await this.owner(businessId, actorUserId);
    reason = this.reason(reason);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      const rate = await tx.voiceBillingRateVersion.findFirst({
        where: { id, businessId },
      });
      if (!rate)
        throw fail(
          'VOICE_BILLING_RATE_NOT_FOUND',
          'The rate version was not found.',
          HttpStatus.NOT_FOUND,
        );
      if (rate.approvedAt) return rate;
      if (
        await tx.voiceBillingRateVersion.count({
          where: {
            businessId,
            version: { gt: rate.version },
            approvedAt: { not: null },
          },
        })
      )
        throw fail(
          'VOICE_BILLING_RATE_SUPERSEDED',
          'A newer rate version is approved. This older version cannot supersede it.',
        );
      const updated = await tx.voiceBillingRateVersion.update({
        where: { id },
        data: { approvedAt: new Date(), approvedByUserId: actorUserId },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceBillingRateVersion',
          entityId: id,
          action: 'voice.billing.rates_approved',
          after: { version: rate.version, sourceHash: rate.sourceHash, reason },
        },
      });
      return updated;
    });
  }

  private items(
    rows: UsageEvidence[],
    rates: VoiceSellingRate[],
  ): VoiceBillingItem[] {
    const byKey = new Map(rates.map((r) => [`${r.provider}:${r.unit}`, r]));
    return rows
      .flatMap((row) => {
        const rate = byKey.get(`${row.provider}:${row.unit}`);
        if (
          !rate ||
          row.call?.isTestCall ||
          !measuredStates.includes(row.state) ||
          row.quantity.lte(0)
        )
          return [];
        const amount = row.quantity.mul(rate.price).div(rate.perQuantity);
        return [
          {
            usageRecordId: row.id,
            provider: row.provider,
            unit: row.unit,
            quantity: row.quantity.toString(),
            price: rate.price,
            perQuantity: rate.perQuantity,
            amount: amount.toString(),
            usageState: row.state,
            providerCost: row.cost?.toString() ?? null,
            providerCurrency: row.currency,
            measuredAt: row.measuredAt.toISOString(),
            evidenceHash: hash({
              eventKey: row.eventKey,
              evidence: row.evidence,
              isTestCall: row.call?.isTestCall ?? false,
            }),
          },
        ];
      })
      .sort((a, b) => a.usageRecordId.localeCompare(b.usageRecordId));
  }

  private total(items: VoiceBillingItem[], minorUnits: number) {
    return items
      .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))
      .toDecimalPlaces(minorUnits, Prisma.Decimal.ROUND_HALF_UP);
  }

  private async rateWindow(
    businessId: string,
    rate: { version: number; approvedAt: Date | null; effectiveFrom: Date },
    period: { start: Date; end: Date },
  ) {
    if (!rate.approvedAt)
      throw fail(
        'VOICE_BILLING_RATE_APPROVAL_REQUIRED',
        'Approve this selling rate version before preparing usage.',
      );
    const start = new Date(
      Math.max(
        period.start.getTime(),
        rate.approvedAt.getTime(),
        rate.effectiveFrom.getTime(),
      ),
    );
    const nextRates = await this.db.voiceBillingRateVersion.findMany({
      where: {
        businessId,
        version: { gt: rate.version },
        approvedAt: { not: null },
      },
      select: { approvedAt: true, effectiveFrom: true },
    });
    const end = new Date(
      Math.min(
        period.end.getTime(),
        Date.now(),
        ...nextRates.map((r) =>
          Math.max(r.approvedAt!.getTime(), r.effectiveFrom.getTime()),
        ),
      ),
    );
    return { start, end };
  }

  async createDraft(
    businessId: string,
    actorUserId: string,
    rateVersionId: string,
    month: string,
  ) {
    await this.owner(businessId, actorUserId);
    const period = this.period(month);
    const rate = await this.db.voiceBillingRateVersion.findFirst({
      where: { id: rateVersionId, businessId },
    });
    if (!rate)
      throw fail(
        'VOICE_BILLING_RATE_NOT_FOUND',
        'The rate version was not found.',
        HttpStatus.NOT_FOUND,
      );
    const window = await this.rateWindow(businessId, rate, period);
    const rates = rate.rates as unknown as VoiceSellingRate[];
    const rows = await this.db.voiceUsageRecord.findMany({
      where: {
        businessId,
        billingClaim: { is: null },
        quantity: { gt: 0 },
        state: { in: measuredStates },
        measuredAt: { gte: window.start, lt: window.end },
        OR: rates.map((r) => ({ provider: r.provider, unit: r.unit })),
        AND: [
          { OR: [{ callId: null }, { call: { is: { isTestCall: false } } }] },
        ],
      },
      include: { call: { select: { isTestCall: true } } },
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
      take: VOICE_BILLING_BATCH_SIZE,
    });
    const items = this.items(rows, rates);
    if (!items.length)
      throw fail(
        'VOICE_BILLING_NO_ELIGIBLE_USAGE',
        'No unbilled measured usage matches this approved rate window. Test calls, pending usage records, samples and usage before rate approval are excluded.',
      );
    const total = this.total(items, rate.currencyMinorUnits);
    if (total.gte('1000000000000'))
      throw fail(
        'VOICE_BILLING_AMOUNT_TOO_LARGE',
        'The draft exceeds the supported amount. Prepare a smaller batch.',
      );
    return this.db.$transaction(async (tx) => {
      const draft = await tx.voiceBillingDraft.create({
        data: {
          businessId,
          rateVersionId,
          periodStart: period.start,
          periodEnd: period.end,
          currency: rate.currency,
          currencyMinorUnits: rate.currencyMinorUnits,
          total,
          itemCount: items.length,
          items: items as unknown as Prisma.InputJsonValue,
          evidenceHash: hash({ rateVersionId, items, total: total.toString() }),
          createdByUserId: actorUserId,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceBillingDraft',
          entityId: draft.id,
          action: 'voice.billing.draft_created',
          after: {
            rateVersionId,
            itemCount: items.length,
            total: total.toString(),
            currency: rate.currency,
            evidenceHash: draft.evidenceHash,
          },
        },
      });
      return draft;
    });
  }

  async detail(businessId: string, id: string) {
    const draft = await this.db.voiceBillingDraft.findFirst({
      where: { id, businessId },
      include: {
        rateVersion: { select: { version: true, sourceReference: true } },
      },
    });
    if (!draft)
      throw fail(
        'VOICE_BILLING_DRAFT_NOT_FOUND',
        'The usage draft was not found.',
        HttpStatus.NOT_FOUND,
      );
    return { ...draft, total: draft.total.toString() };
  }

  async decideDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approved' | 'cancelled',
    reason: string,
  ) {
    await this.owner(businessId, actorUserId);
    reason = this.reason(reason);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
        const draft = await tx.voiceBillingDraft.findFirst({
          where: { id, businessId },
          include: { rateVersion: true },
        });
        if (!draft)
          throw fail(
            'VOICE_BILLING_DRAFT_NOT_FOUND',
            'The usage draft was not found.',
            HttpStatus.NOT_FOUND,
          );
        if (draft.status === decision) return draft;
        if (draft.status !== 'draft')
          throw fail(
            'VOICE_BILLING_DRAFT_LOCKED',
            'Only an unapproved draft can be changed. Approved usage needs a billing adjustment, not a second approval.',
          );
        if (decision === 'approved') {
          const snapshots = draft.items as unknown as VoiceBillingItem[];
          const usageIds = snapshots.map((item) => item.usageRecordId);
          // Claim uniqueness plus the business lock serializes concurrent approvals.
          if (
            await tx.voiceBillingUsageClaim.count({
              where: { businessId, usageRecordId: { in: usageIds } },
            })
          )
            throw fail(
              'VOICE_BILLING_USAGE_ALREADY_APPROVED',
              'Another draft already includes some of this usage. Cancel this draft and prepare the remaining usage.',
            );
          const rows = await tx.voiceUsageRecord.findMany({
            where: { businessId, id: { in: usageIds } },
            include: { call: { select: { isTestCall: true } } },
          });
          const items = this.items(
            rows,
            draft.rateVersion.rates as unknown as VoiceSellingRate[],
          );
          const total = this.total(items, draft.currencyMinorUnits);
          if (
            hash({
              rateVersionId: draft.rateVersionId,
              items,
              total: total.toString(),
            }) !== draft.evidenceHash
          )
            throw fail(
              'VOICE_BILLING_USAGE_CHANGED',
              'The provider usage changed after this draft was prepared. Cancel it and prepare a new draft for review.',
            );
          await tx.voiceBillingUsageClaim.createMany({
            data: items.map((item) => ({
              businessId,
              draftId: id,
              usageRecordId: item.usageRecordId,
              snapshot: item as unknown as Prisma.InputJsonValue,
            })),
          });
        }
        const updated = await tx.voiceBillingDraft.update({
          where: { id },
          data: {
            status: decision,
            decisionReason: reason,
            ...(decision === 'approved'
              ? { approvedAt: new Date(), approvedByUserId: actorUserId }
              : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            entity: 'VoiceBillingDraft',
            entityId: id,
            action: `voice.billing.draft_${decision}`,
            after: {
              reason,
              evidenceHash: draft.evidenceHash,
              total: draft.total.toString(),
              currency: draft.currency,
            },
          },
        });
        return updated;
      },
      { timeout: 15_000 },
    );
  }
}
