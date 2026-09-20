import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma, ReportRun, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SendGateService } from '../messaging/send-gate.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { computeNextRun } from '../exports/schedule-timing';
import { BuildContext, BusinessInfo, ReportBuildersService } from './report-builders.service';
import { renderReportHtml } from './report-renderer';
import type { ReportData } from './report-data.types';
import {
  REPORT_CATALOG,
  REPORT_LABELS,
  ReportKind,
  currentMonth,
  isReportKind,
  monthBounds,
  monthLabel,
  previousMonth,
  round2,
} from './reports.types';

export type ReportTrigger = 'manual' | 'schedule' | 'ai_builder';

export interface RunSummary {
  id: string;
  kind: string;
  period: string;
  version: number;
  status: 'ready' | 'failed';
  trigger: string;
  generatedAt: string;
  generatedById: string | null;
  generatedByName: string | null;
  recordsCount: number;
  validationStatus: string | null;
  exclusionsCount: number;
  summary: string | null;
  errorMessage: string | null;
}

export interface GenerateParams {
  /** The active (branch-aware) business the report is for. */
  businessId: string;
  kind: ReportKind;
  month?: string;
  actor: { userId?: string; role: Role; membershipBusinessId?: string };
  trigger?: ReportTrigger;
  scheduleId?: string;
}

interface DeliveryEntry {
  at: string;
  messageId: string | null;
  channel: string | null;
  recipient: string;
  byUserId: string | null;
  error?: string;
}

const AI_BUILDER_KIND = 'report_builder';

/**
 * Persistence and reading side of the Reports module: every generation is a `ReportRun`
 * (versioned, validated, audited), and the library, drawer sections, downloads, deliveries and
 * explanations are all read back from those rows — nothing on screen is computed from a
 * placeholder.
 */
@Injectable()
export class ReportRunsService {
  private readonly logger = new Logger(ReportRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly locale: LocaleService,
    private readonly s3: S3Service,
    private readonly pdfRenderer: PdfRendererService,
    private readonly builders: ReportBuildersService,
    private readonly sendGate: SendGateService,
    private readonly aiInfra: AiInfraService,
  ) {}

  /** Branch-aware business id: what `X-Branch` resolved to, else the caller's home business. */
  activeBusinessId(fallback: string): string {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? fallback;
  }

  private async businessInfo(businessId: string): Promise<BusinessInfo> {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    return {
      name: b.name,
      currency: b.currency,
      locale: b.locale,
      timezone: b.timezone,
      taxLabel: b.taxLabel,
      phone: b.phone,
      address: b.address,
    };
  }

  private async audit(
    businessId: string,
    actorUserId: string | null | undefined,
    action: string,
    runId: string,
    after?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          actorUserId: actorUserId ?? null,
          action,
          entity: 'report_run',
          entityId: runId,
          after: after === undefined ? undefined : (after as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      this.logger.warn(`Report audit entry failed: ${(error as Error).message}`);
    }
  }

  private async nameMap(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private toSummary(
    run: Pick<
      ReportRun,
      | 'id' | 'kind' | 'period' | 'version' | 'status' | 'trigger' | 'createdAt'
      | 'generatedByUserId' | 'recordsCount' | 'validationStatus' | 'exclusionsCount'
      | 'summary' | 'errorMessage'
    >,
    names: Map<string, string>,
  ): RunSummary {
    return {
      id: run.id,
      kind: run.kind,
      period: run.period,
      version: run.version,
      status: run.status,
      trigger: run.trigger,
      generatedAt: run.createdAt.toISOString(),
      generatedById: run.generatedByUserId,
      generatedByName: run.generatedByUserId ? (names.get(run.generatedByUserId) ?? null) : null,
      recordsCount: run.recordsCount,
      validationStatus: run.validationStatus,
      exclusionsCount: run.exclusionsCount,
      summary: run.summary,
      errorMessage: run.errorMessage,
    };
  }

  // ------------------------------------------------------------------ generate

  /**
   * Builds the report, validates it, renders the PDF and records the run. A generation that fails
   * for a real reason (a query error, the renderer) is recorded as a failed run with that reason —
   * kept in history rather than hidden — and nothing is estimated in its place. A permission
   * refusal is not a failure and is not recorded.
   */
  async generate(params: GenerateParams): Promise<{ url: string; run: RunSummary }> {
    const { businessId, kind, actor } = params;
    const month = params.month ?? currentMonth();
    const entry = REPORT_CATALOG.find((c) => c.kind === kind)!;
    if (!entry.roles.includes(actor.role)) {
      throw new AppException('REPORT_FORBIDDEN', `${REPORT_LABELS[kind]} is not available to your role.`, HttpStatus.FORBIDDEN);
    }

    const business = await this.businessInfo(businessId);
    const membership =
      actor.userId && actor.role === Role.staff
        ? await this.prisma.businessUser.findUnique({
            where: { businessId_userId: { businessId: actor.membershipBusinessId ?? businessId, userId: actor.userId } },
          })
        : null;
    const ctx: BuildContext = { businessId, month, business, role: actor.role, businessUserId: membership?.id };

    const latest = await this.prisma.reportRun.aggregate({
      where: { businessId, kind, period: month },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const trigger = params.trigger ?? 'manual';

    let data: ReportData;
    try {
      data = await this.builders.build(kind, ctx);
    } catch (error) {
      if (error instanceof AppException) throw error;
      const message = (error as Error).message;
      const failed = await this.prisma.reportRun.create({
        data: {
          businessId, kind, period: month, version, status: 'failed', trigger,
          generatedByUserId: actor.userId ?? null, scheduleId: params.scheduleId ?? null,
          errorMessage: message.slice(0, 2000),
          validationStatus: 'critical',
        },
      });
      await this.audit(businessId, actor.userId, 'report.failed', failed.id, { kind, period: month, error: message.slice(0, 300) });
      throw new AppException('REPORT_GENERATION_FAILED', `${REPORT_LABELS[kind]} could not be generated: ${message}. Nothing was estimated in its place.`, HttpStatus.BAD_GATEWAY);
    }

    const requester = actor.userId
      ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } })
      : null;
    const generatedAt = new Date();
    let fileKey: string;
    let url: string;
    try {
      const html = renderReportHtml(data, business, {
        generatedAt,
        generatedBy: requester?.name ?? 'Automated schedule',
        version,
      });
      const pdf = await this.pdfRenderer.renderPdf(html);
      fileKey = `reports/${businessId}/${kind}-${month}-v${version}.pdf`;
      url = await this.s3.uploadAndSign(fileKey, pdf, 'application/pdf');
    } catch (error) {
      const message = (error as Error).message;
      const failed = await this.prisma.reportRun.create({
        data: {
          businessId, kind, period: month, version, status: 'failed', trigger,
          generatedByUserId: actor.userId ?? null, scheduleId: params.scheduleId ?? null,
          errorMessage: `The document could not be rendered: ${message}`.slice(0, 2000),
          validationStatus: data.validation.status, summary: data.summary,
        },
      });
      await this.audit(businessId, actor.userId, 'report.failed', failed.id, { kind, period: month, error: message.slice(0, 300) });
      throw new AppException('REPORT_GENERATION_FAILED', `${REPORT_LABELS[kind]} was computed but its document could not be created: ${message}.`, HttpStatus.BAD_GATEWAY);
    }

    const run = await this.prisma.reportRun.create({
      data: {
        businessId, kind, period: month, version, status: 'ready', trigger,
        generatedByUserId: actor.userId ?? null, scheduleId: params.scheduleId ?? null,
        fileKey, recordsCount: data.recordsCount,
        validationStatus: data.validation.status,
        exclusionsCount: data.validation.exclusions.length,
        summary: data.summary,
        snapshot: data as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(businessId, actor.userId, 'report.generated', run.id, { kind, period: month, version, trigger, validation: data.validation.status });

    const names = await this.nameMap([run.generatedByUserId]);
    return { url, run: this.toSummary(run, names) };
  }

  // ------------------------------------------------------------------ library

  async library(businessId: string, role: Role, userId: string, period?: string) {
    const month = period ?? currentMonth();
    const monthStartOfNow = monthBounds(currentMonth());

    const [periodRuns, allRecent, favorites, schedules, sentRuns] = await Promise.all([
      this.prisma.reportRun.findMany({
        where: { businessId, period: month },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, kind: true, period: true, version: true, status: true, trigger: true, createdAt: true,
          generatedByUserId: true, recordsCount: true, validationStatus: true, exclusionsCount: true,
          summary: true, errorMessage: true,
        },
      }),
      this.prisma.reportRun.findMany({
        where: { businessId, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, kind: true, status: true, trigger: true, createdAt: true },
      }),
      this.prisma.reportFavorite.findMany({ where: { businessId, userId } }),
      this.prisma.scheduledExport.findMany({ where: { businessId, reportKind: { not: null } } }),
      this.prisma.reportRun.findMany({
        where: { businessId, createdAt: { gte: monthStartOfNow.start } },
        select: { deliveries: true },
      }),
    ]);

    const names = await this.nameMap(periodRuns.map((r) => r.generatedByUserId));
    const favSet = new Set(favorites.map((f) => f.kind));
    const latestByKind = new Map<string, (typeof periodRuns)[number]>();
    const countByKind = new Map<string, number>();
    for (const r of periodRuns) {
      if (!latestByKind.has(r.kind)) latestByKind.set(r.kind, r);
      countByKind.set(r.kind, (countByKind.get(r.kind) ?? 0) + 1);
    }

    const reports = REPORT_CATALOG.map((c) => {
      const schedule = schedules.find((s) => s.reportKind === c.kind);
      const latest = latestByKind.get(c.kind);
      return {
        kind: c.kind, name: c.name, description: c.description, icon: c.icon,
        allowed: c.roles.includes(role as 'owner' | 'manager' | 'staff'),
        favorite: favSet.has(c.kind),
        latest: latest ? this.toSummary(latest, names) : null,
        runsInPeriod: countByKind.get(c.kind) ?? 0,
        schedule: schedule ? { id: schedule.id, active: schedule.active, frequency: schedule.frequency } : null,
      };
    });

    const visible = reports.filter((r) => r.allowed);
    const ready = visible.filter((r) => r.latest?.status === 'ready').length;
    const failed = visible.filter((r) => r.latest?.status === 'failed');

    const thisMonthRuns = allRecent.filter((r) => r.createdAt >= monthStartOfNow.start && r.status === 'ready');
    const useCount = new Map<string, number>();
    for (const r of allRecent.filter((x) => x.status === 'ready')) useCount.set(r.kind, (useCount.get(r.kind) ?? 0) + 1);
    const mostUsedKind = [...useCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const mostRecent = allRecent.find((r) => r.status === 'ready');

    const activeSchedules = schedules.filter((s) => s.active);
    const nextRuns = activeSchedules
      .map((s) => ({ s, at: computeNextRun({ ...s, frequency: s.frequency }) }))
      .filter((x): x is { s: (typeof schedules)[number]; at: Date } => x.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    const deliveries = sentRuns.flatMap((r) => (r.deliveries as unknown as DeliveryEntry[]) ?? []);
    const channels = [...new Set(deliveries.map((d) => d.channel).filter((c): c is string => !!c))];

    return {
      period: month,
      periodLabel: monthLabel(month),
      reports,
      kpis: {
        available: visible.length,
        ready,
        failed: failed.length,
        failedNames: failed.map((f) => f.name),
        generatedThisMonth: thisMonthRuns.length,
        automatedThisMonth: thisMonthRuns.filter((r) => r.trigger === 'schedule').length,
        scheduled: activeSchedules.length,
        nextScheduled: nextRuns[0]
          ? { reportName: REPORT_LABELS[nextRuns[0].s.reportKind as ReportKind] ?? nextRuns[0].s.reportKind, at: nextRuns[0].at.toISOString() }
          : null,
        sent: deliveries.length,
        sentChannels: channels,
        mostUsed: mostUsedKind ? { name: REPORT_LABELS[mostUsedKind[0] as ReportKind] ?? mostUsedKind[0], count: mostUsedKind[1] } : null,
        mostRecent: mostRecent ? { name: REPORT_LABELS[mostRecent.kind as ReportKind] ?? mostRecent.kind, at: mostRecent.createdAt.toISOString() } : null,
      },
    };
  }

  async toggleFavorite(businessId: string, userId: string, kind: string): Promise<{ favorite: boolean }> {
    if (!isReportKind(kind)) throw new AppException('REPORT_UNKNOWN', `Unknown report kind: ${kind}`, HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.reportFavorite.findUnique({ where: { businessId_userId_kind: { businessId, userId, kind } } });
    if (existing) {
      await this.prisma.reportFavorite.delete({ where: { id: existing.id } });
      return { favorite: false };
    }
    await this.prisma.reportFavorite.create({ data: { businessId, userId, kind } });
    return { favorite: true };
  }

  // ------------------------------------------------------------------ one run

  private async findRun(businessId: string, id: string): Promise<ReportRun> {
    const run = await this.prisma.reportRun.findUnique({ where: { id } });
    if (!run || run.businessId !== businessId) {
      throw new AppException('REPORT_NOT_FOUND', 'Report not found', HttpStatus.NOT_FOUND);
    }
    return run;
  }

  async getRun(businessId: string, id: string) {
    const run = await this.findRun(businessId, id);
    const [versions, schedule] = await Promise.all([
      this.prisma.reportRun.findMany({
        where: { businessId, kind: run.kind, period: run.period },
        orderBy: { version: 'desc' },
        select: {
          id: true, kind: true, period: true, version: true, status: true, trigger: true, createdAt: true,
          generatedByUserId: true, recordsCount: true, validationStatus: true, exclusionsCount: true,
          summary: true, errorMessage: true, snapshot: true,
        },
      }),
      this.prisma.scheduledExport.findFirst({ where: { businessId, reportKind: run.kind } }),
    ]);
    const names = await this.nameMap([run.generatedByUserId, ...versions.map((v) => v.generatedByUserId)]);

    const previous = versions.find((v) => v.version < run.version && v.status === 'ready');
    const currentData = run.snapshot as unknown as ReportData | null;
    const previousData = previous?.snapshot as unknown as ReportData | null | undefined;
    const kpiChanges =
      currentData && previousData
        ? currentData.kpis.map((k) => ({ label: k.label, current: k.display, previous: previousData.kpis.find((p) => p.label === k.label)?.display ?? '—' }))
        : [];

    // Delivery states come from the channel's own record of each message — only what it reported.
    const deliveries = (run.deliveries as unknown as DeliveryEntry[]) ?? [];
    const messageIds = deliveries.map((d) => d.messageId).filter((m): m is string => !!m);
    const messages = messageIds.length
      ? await this.prisma.message.findMany({ where: { id: { in: messageIds } }, select: { id: true, status: true, channel: true } })
      : [];
    const msgById = new Map(messages.map((m) => [m.id, m]));
    const deliveryRows = deliveries.map((d) => ({
      at: d.at,
      channel: d.channel ?? msgById.get(d.messageId ?? '')?.channel ?? null,
      recipient: d.recipient,
      state: d.error ? 'failed' : (msgById.get(d.messageId ?? '')?.status ?? 'unknown'),
      error: d.error ?? null,
      byName: d.byUserId ? (names.get(d.byUserId) ?? null) : null,
    }));

    return {
      run: this.toSummary(run, names),
      periodLabel: monthLabel(run.period),
      catalog: REPORT_CATALOG.find((c) => c.kind === run.kind) ?? null,
      snapshot: currentData,
      versions: versions.map((v) => this.toSummary(v, names)),
      kpiChanges,
      previousExclusions: previousData?.validation.exclusions ?? null,
      deliveries: deliveryRows,
      schedule: schedule
        ? { id: schedule.id, active: schedule.active, frequency: schedule.frequency, nextRunAt: computeNextRun(schedule)?.toISOString() ?? null, recipients: schedule.recipients, lastResult: schedule.lastResult }
        : null,
    };
  }

  async download(businessId: string, actorUserId: string, id: string): Promise<{ url: string }> {
    const run = await this.findRun(businessId, id);
    if (run.status !== 'ready' || !run.fileKey) {
      throw new AppException('REPORT_NOT_AVAILABLE', 'This run has no document — it failed to generate.', HttpStatus.BAD_REQUEST);
    }
    const url = await this.s3.getSignedDownloadUrl(run.fileKey);
    await this.audit(businessId, actorUserId, 'report.downloaded', run.id, { version: run.version, format: 'pdf' });
    return { url };
  }

  async audit_trail(businessId: string, id: string) {
    const run = await this.findRun(businessId, id);
    const events = await this.prisma.auditLog.findMany({
      where: { businessId, entity: 'report_run', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.nameMap([run.generatedByUserId, ...events.map((e) => e.actorUserId)]);
    const siblings = await this.prisma.reportRun.count({ where: { businessId, kind: run.kind, period: run.period } });
    return {
      trigger: run.trigger,
      aiBuilt: run.trigger === 'ai_builder',
      regenerations: Math.max(siblings - 1, 0),
      events: events.map((e) => ({
        at: e.createdAt.toISOString(),
        action: e.action,
        actorName: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null,
        detail: e.after,
      })),
    };
  }

  // ------------------------------------------------------------------ send

  /**
   * Sends the report link over the business's real messaging path (`SendGateService`, which
   * resolves the channel from what the recipient can actually receive and what is connected). The
   * message id is stored so the delivery state shown later is the channel's own report, never an
   * assumption. Sending to anyone other than yourself moves financial data out of Noxtill, so it is
   * owner-only.
   */
  async send(
    businessId: string,
    actor: { userId: string; role: Role },
    id: string,
    recipient?: { email?: string; phone?: string },
  ) {
    const run = await this.findRun(businessId, id);
    if (run.status !== 'ready' || !run.fileKey) {
      throw new AppException('REPORT_NOT_AVAILABLE', 'This run has no document to send — it failed to generate.', HttpStatus.BAD_REQUEST);
    }
    const external = !!(recipient?.email || recipient?.phone);
    if (external && actor.role !== Role.owner) {
      throw new AppException('REPORT_FORBIDDEN', 'Only the owner can send a report to someone else.', HttpStatus.FORBIDDEN);
    }
    const self = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const to = external ? recipient! : { phone: self.phone ?? undefined, email: self.email ?? undefined };
    if (!to.phone && !to.email) {
      throw new AppException('REPORT_NO_RECIPIENT', 'There is no phone number or email address to send this to.', HttpStatus.BAD_REQUEST);
    }
    const url = await this.s3.getSignedDownloadUrl(run.fileKey);
    const label = `${REPORT_LABELS[run.kind as ReportKind] ?? run.kind} · ${monthLabel(run.period)}`;

    const entry: DeliveryEntry = {
      at: new Date().toISOString(), messageId: null, channel: null,
      recipient: to.email ?? to.phone ?? '', byUserId: actor.userId,
    };
    try {
      const message = await this.cls.run(async () => {
        this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
        return this.sendGate.send({ businessId, templateKey: 'report_ready', to, variables: { reportLabel: label, url } });
      });
      entry.messageId = message.id;
      entry.channel = message.channel;
    } catch (error) {
      entry.error = (error as Error).message;
    }
    const deliveries = [...((run.deliveries as unknown as DeliveryEntry[]) ?? []), entry];
    await this.prisma.reportRun.update({ where: { id }, data: { deliveries: deliveries as unknown as Prisma.InputJsonValue } });
    await this.audit(businessId, actor.userId, entry.error ? 'report.send_failed' : 'report.sent', id, { recipient: entry.recipient, channel: entry.channel, error: entry.error });

    if (entry.error) {
      throw new AppException('REPORT_SEND_FAILED', `The report could not be sent: ${entry.error}`, HttpStatus.BAD_GATEWAY);
    }
    return { channel: entry.channel, state: 'queued' as const, recipient: entry.recipient };
  }

  // ------------------------------------------------------------------ explain

  /**
   * "Explain this report": a deterministic comparison against the previous month, built only from
   * recorded figures — never a model's guess about causes. Contributors are real per-product
   * differences in gross profit between the two months, so their sum is checkable.
   */
  async explain(businessId: string, id: string) {
    const run = await this.findRun(businessId, id);
    const data = run.snapshot as unknown as ReportData | null;
    if (!data) throw new AppException('REPORT_NOT_AVAILABLE', 'This run has no data to explain — it failed to generate.', HttpStatus.BAD_REQUEST);

    const prevMonth = previousMonth(run.period);
    const rows: { label: string; value: string }[] = [
      { label: 'Data period', value: data.periodLabel },
      { label: 'Comparison', value: `Previous calendar month (${monthLabel(prevMonth)})` },
      { label: 'Sources used', value: data.sources.map((s) => s.module).join(' · ') },
      { label: 'Records included', value: data.recordsCount.toLocaleString('en-US') },
    ];
    const bullets: string[] = [];

    const revenueBased = ['monthly', 'pnl', 'sales', 'product_performance'].includes(run.kind);
    if (revenueBased) {
      const { start, end } = monthBounds(run.period);
      const prev = monthBounds(prevMonth);
      const perProduct = (from: Date, to: Date) =>
        this.prisma.$queryRaw<{ name: string; profit: string }[]>`
          SELECT oi.name, SUM((oi.price - oi.cost) * oi.qty) AS profit
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
            AND o.created_at >= ${from} AND o.created_at < ${to}
          GROUP BY oi.name
        `;
      const [cur, before] = await Promise.all([perProduct(start, end), perProduct(prev.start, prev.end)]);
      const beforeMap = new Map(before.map((r) => [r.name, Number(r.profit)]));
      const seen = new Set<string>();
      const deltas: { name: string; delta: number }[] = [];
      for (const r of cur) {
        seen.add(r.name);
        deltas.push({ name: r.name, delta: round2(Number(r.profit) - (beforeMap.get(r.name) ?? 0)) });
      }
      for (const [name, p] of beforeMap) if (!seen.has(name)) deltas.push({ name, delta: round2(-p) });
      deltas.sort((a, b) => b.delta - a.delta);
      const best = deltas[0];
      const worst = deltas[deltas.length - 1];
      const business = await this.businessInfo(businessId);
      const fmt = (n: number) => `${n < 0 ? '− ' : '+ '}${this.locale.formatCurrency(Math.abs(n), business)}`;
      if (best && best.delta > 0) rows.push({ label: 'Largest positive contributor', value: `${best.name} · ${fmt(best.delta)} gross profit` });
      if (worst && worst.delta < 0) rows.push({ label: 'Largest negative contributor', value: `${worst.name} · ${fmt(worst.delta)} gross profit` });
      const totalDelta = round2(deltas.reduce((s, d) => s + d.delta, 0));
      rows.push({ label: 'Total change in product gross profit', value: fmt(totalDelta) });
      bullets.push('Contributors are the per-product change in gross profit between the two months, so their sum equals the total change shown.');
    }

    rows.push({ label: 'Excluded from calculations', value: data.validation.exclusions.length ? data.validation.exclusions.join('; ') : 'Nothing' });
    rows.push({ label: 'Data confidence', value: data.validation.status === 'reconciled' ? 'High · reconciled' : data.validation.status === 'warning' ? 'Medium · reconciled with exclusions' : 'Low · reconciliation failed' });
    rows.push({ label: 'Contains forecast', value: 'No — every figure is actual' });

    bullets.push('Every figure comes from recorded transactions for the period; nothing was estimated.');
    if (data.validation.exclusions.length) bullets.push('Records left out of a calculation are named above rather than estimated.');

    return {
      title: `${data.title} · what the numbers say`,
      summary: data.summary,
      confidence: data.validation.status,
      rows,
      bullets,
      note: 'Every statement here traces to recorded data, a period and a calculation. No cause is asserted that the data does not show.',
    };
  }

  // ------------------------------------------------------------------ AI builder

  /**
   * Turns "top 20 products by profit this month" into one of the report kinds that actually
   * exist, for the owner to confirm before anything is generated. The model may only choose from
   * the supported set — anything else is answered honestly as unsupported, with the closest match.
   */
  async parseRequest(businessId: string, role: Role, request: string) {
    const kinds = REPORT_CATALOG.map((c) => `- ${c.kind}: ${c.name} — ${c.description}`).join('\n');
    const now = currentMonth();
    const prompt = [
      'You map a business owner\'s free-text report request onto ONE of the supported report kinds.',
      `Supported kinds:\n${kinds}`,
      `Today's month is ${now}. Periods are calendar months in YYYY-MM form only.`,
      `Request: "${request.replace(/"/g, "'")}"`,
      'Reply with ONLY JSON: {"kind": string|null, "month": "YYYY-MM", "unsupportedReason": string|null}.',
      'Use kind null with a short unsupportedReason if the request cannot be met by any supported kind (for example a custom metric, a week-level range, or a comparison of two years). Never invent a kind.',
    ].join('\n\n');

    let parsed: { kind: string | null; month?: string; unsupportedReason?: string | null } = { kind: null };
    try {
      const raw = await this.aiInfra.complete(businessId, prompt, 0, AI_BUILDER_KIND);
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException('AI_UNAVAILABLE', 'The AI report builder is not available right now — please try again later.', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const kind = parsed.kind && isReportKind(parsed.kind) ? parsed.kind : null;
    const month = parsed.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(parsed.month) ? parsed.month : now;
    if (!kind) {
      return {
        supported: false as const,
        request,
        reason: parsed.unsupportedReason ?? 'That request does not match any report Noxtill can build.',
      };
    }
    const entry = REPORT_CATALOG.find((c) => c.kind === kind)!;
    const allowed = entry.roles.includes(role as 'owner' | 'manager' | 'staff');
    return {
      supported: true as const,
      request,
      kind,
      name: entry.name,
      month,
      periodLabel: monthLabel(month),
      allowed,
      permissionNote: allowed ? 'Passed · your role may generate this report' : 'Refused · your role may not generate this report',
    };
  }
}
