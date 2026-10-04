import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, num } from './pay-context.service';
import { PayDataService, Scope } from './pay-data.service';
import { PayViewsService } from './pay-views.service';
import { PAY_ERRORS } from './payments.constants';

export interface PayFile {
  fileName: string;
  contentType: string;
  body: Buffer;
  rows: number;
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** Payments exports (CSV / XLSX). Card data is never exported; customer PII follows the retention policy. */
@Injectable()
export class PayDocsService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly data: PayDataService,
    private readonly views: PayViewsService,
  ) {}

  private async file(
    format: string,
    title: string,
    head: string[],
    rows: (string | number)[][],
  ): Promise<PayFile> {
    const base = `${title.replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(title.slice(0, 30));
      ws.addRow(head).font = { bold: true };
      for (const r of rows) ws.addRow(r);
      ws.columns.forEach(
        (c, i) =>
          (c.width = Math.min(
            48,
            Math.max(
              10,
              ...[head[i] ?? '', ...rows.map((r) => String(r[i] ?? ''))].map(
                (v) => v.length + 2,
              ),
            ),
          )),
      );
      return {
        fileName: `${base}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from(await wb.xlsx.writeBuffer()),
        rows: rows.length,
      };
    }
    const csv = [head, ...rows]
      .map((r) => r.map((v) => csvCell(String(v ?? ''))).join(','))
      .join('\n');
    return {
      fileName: `${base}.csv`,
      contentType: 'text/csv',
      body: Buffer.from(String.fromCharCode(0xfeff) + csv, 'utf8'),
      rows: rows.length,
    };
  }

  async export(
    a: PayActor,
    s: Scope,
    what: string,
    format: string,
    opts: { ids?: string[]; full?: boolean; payout?: string },
  ) {
    if (!a.export)
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — exports need “payments.export”.',
        HttpStatus.FORBIDDEN,
      );
    const pol = await this.ctx.policy(a.rootId);
    const full =
      !!opts.full &&
      a.role === 'Owner' &&
      pol.retention.exportPII === 'Masked unless Owner' &&
      a.pii;
    const d = await this.data.load({ ...a, pii: full }, s);
    let out: PayFile;
    if (what === 'payouts' || what === 'payout') {
      const payouts = await this.ctx.db.payPayout.findMany({
        where: {
          businessId: a.rootId,
          env: s.env,
          ...(opts.payout
            ? { OR: [{ id: opts.payout }, { providerPayoutId: opts.payout }] }
            : {}),
        },
        orderBy: { arrivalDate: 'desc' },
      });
      const bts = await this.ctx.db.payBalanceTxn.findMany({
        where: { payoutRef: { in: payouts.map((p) => p.providerPayoutId) } },
        orderBy: { occurredAt: 'asc' },
      });
      const txs = new Map(
        (
          await this.ctx.db.payTransaction.findMany({
            where: {
              id: {
                in: bts.map((b) => b.txId).filter((x): x is string => !!x),
              },
            },
          })
        ).map((t) => [t.id, t]),
      );
      out = await this.file(
        format,
        'Settlement report',
        [
          'Payout',
          'Payout status',
          'Arrival',
          'Line type',
          'Provider ref',
          'Noxtill transaction',
          'Customer',
          'Gross',
          'Fee',
          'Net',
          'Currency',
        ],
        bts.length
          ? bts.map((b) => {
              const p = payouts.find(
                (x) => x.providerPayoutId === b.payoutRef,
              )!;
              const t = b.txId ? txs.get(b.txId) : null;
              return [
                p.providerPayoutId,
                p.status,
                p.arrivalDate?.toISOString().slice(0, 10) ?? '',
                b.type,
                b.sourceObjectId ?? b.providerTxnId,
                t?.number ?? '',
                this.data.cname(d, t?.customerId),
                num(b.amount),
                a.fees ? num(b.fee) : '',
                num(b.net),
                b.currency,
              ];
            })
          : payouts.map((p) => [
              p.providerPayoutId,
              p.status,
              p.arrivalDate?.toISOString().slice(0, 10) ?? '',
              'payout',
              p.providerPayoutId,
              '',
              '',
              '',
              '',
              num(p.amount),
              p.currency,
            ]),
      );
    } else if (what === 'reconciliation') {
      const items = await this.ctx.db.payReconItem.findMany({
        where: { businessId: a.rootId, env: 'live' },
        orderBy: { occurredAt: 'desc' },
      });
      out = await this.file(
        format,
        'Provider reconciliation',
        [
          'Provider ref',
          'Batch',
          'Type',
          'Provider gross',
          'Noxtill gross',
          'Provider fee',
          'Status',
          'Match method',
          'Confidence',
          'Resolution',
          'Time',
        ],
        items.map((r) => [
          r.providerRef,
          r.batchRef ?? '',
          r.type,
          r.providerGross == null ? '' : num(r.providerGross),
          r.noxtillGross == null ? '' : num(r.noxtillGross),
          a.fees && r.providerFee != null ? num(r.providerFee) : '',
          r.status,
          r.matchMethod ?? '',
          r.confidence ?? '',
          r.resolution ?? '',
          r.occurredAt.toISOString(),
        ]),
      );
    } else {
      const { L } = await this.views.txList(d);
      const list = opts.ids?.length
        ? d.all.filter((t) => opts.ids!.includes(t.id))
        : L;
      out = await this.file(
        format,
        'Payment transactions',
        [
          'Transaction',
          'Created',
          'Customer',
          'Source',
          'Provider',
          'Provider ref',
          'Channel',
          'Method',
          'Card',
          'Status',
          'Gross',
          'Captured',
          'Refunded',
          'Fee',
          'Currency',
          `Reporting (${d.base})`,
          'Correlation',
        ],
        list.map((t) => [
          t.number,
          t.occurredAt.toISOString(),
          this.data.cname(d, t.customerId),
          this.data.srcLabel(t),
          this.data.provName(t.provider),
          t.providerChargeId ?? '',
          t.channel,
          t.method,
          t.methodLast4 ? `${t.methodBrand ?? ''} ••••${t.methodLast4}` : '',
          t.status,
          num(t.amount),
          num(t.captured),
          num(t.refunded),
          a.fees && t.fee != null ? num(t.fee) : '',
          t.currency,
          t.reportAmount == null ? '' : num(t.reportAmount),
          t.correlationId,
        ]),
      );
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Export',
      'export',
      what,
      `${out.fileName} · ${out.rows} rows · customer data ${full ? 'full' : 'masked'}`,
    );
    return out;
  }
}
