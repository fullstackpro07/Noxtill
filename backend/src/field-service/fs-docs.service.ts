import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { FsActor, FsContextService, num } from './fs-context.service';
import { FsDataService, FsScope } from './fs-data.service';
import { FsViewsService } from './fs-views.service';
import { hh } from './fs-time';

export interface FsFileOut {
  fileName: string;
  contentType: string;
  body: Buffer;
  rows: number;
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * Exports of the current view (work orders, requests, labor, parts). Columns the person may not
 * see — customer phone (field.pii), costs and rates (field.money) — are left out, not blanked.
 */
@Injectable()
export class FsDocsService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly views: FsViewsService,
  ) {}

  private async file(
    format: string,
    title: string,
    head: string[],
    rows: (string | number)[][],
  ): Promise<FsFileOut> {
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
    a: FsActor,
    s: FsScope,
    what: string,
    format: string,
    ids: string[] = [],
  ) {
    this.ctx.need(a, 'export', 'Exporting');
    const d = await this.data.load(a, s);
    const fmt = format === 'xlsx' ? 'xlsx' : 'csv';
    let out: FsFileOut;
    if (what === 'labor') {
      const L = d.labor.filter((l) => !a.techOnly || l.techUserId === a.userId);
      out = await this.file(
        fmt,
        'Field labor',
        [
          'Entry',
          'Technician',
          'Work order',
          'Type',
          'Start',
          'End',
          'Break (min)',
          'Minutes',
          'Billable',
          'Overtime',
          'Status',
          ...(a.money ? ['Rate / h'] : []),
        ],
        L.map((l) => [
          l.number,
          this.data.tname(d, l.techUserId),
          d.wos.find((w) => w.id === l.woId)?.number ?? '',
          l.type,
          l.startAt.toISOString(),
          l.endAt?.toISOString() ?? 'running',
          l.breakMin,
          this.views.durOf(d, l).m,
          l.billable ? 'Yes' : 'No',
          l.overtime ? 'Yes' : 'No',
          l.status,
          ...(a.money ? [l.rate != null ? num(l.rate) : ''] : []),
        ]),
      );
    } else if (what === 'requests') {
      out = await this.file(
        fmt,
        'Service requests',
        [
          'Request',
          'Customer',
          ...(a.pii ? ['Phone'] : []),
          'Issue',
          'Service type',
          'Channel',
          'Priority',
          'Window',
          'Status',
          'Created',
        ],
        d.requests.map((r) => [
          r.number,
          this.data.cname(d, r.customerId),
          ...(a.pii ? [d.customers.get(r.customerId)?.phone ?? ''] : []),
          r.issue,
          this.data.svName(d, r.serviceTypeId),
          r.channel,
          r.priority,
          r.window ?? '',
          r.status,
          r.createdAt.toISOString(),
        ]),
      );
    } else if (what === 'parts') {
      const rows = this.data
        .wosV(d)
        .flatMap((w) => w.parts.map((p) => ({ w, p })));
      out = await this.file(
        fmt,
        'Field parts',
        [
          'Work order',
          'Part',
          'SKU',
          'Required',
          'Reserved',
          'Issued',
          'Used',
          'Returned',
          'Status',
          ...(a.money ? ['Unit cost'] : []),
        ],
        rows.map(({ w, p }) => [
          w.number,
          this.data.partName(d, p.productId),
          d.products.get(p.productId)?.sku ?? '',
          p.required,
          p.reserved,
          p.issued,
          p.used,
          p.returned,
          this.data.partSt(d, p),
          ...(a.money ? [d.products.get(p.productId)?.cost ?? ''] : []),
        ]),
      );
    } else {
      const L = ids.length
        ? this.data.wosV(d).filter((w) => ids.includes(w.id))
        : this.views.woFiltered(d);
      out = await this.file(
        fmt,
        'Work orders',
        [
          'WO',
          'Customer',
          ...(a.pii ? ['Phone'] : []),
          'Site',
          'Asset',
          'Service',
          'Priority',
          'Status',
          'Technician',
          'Date',
          'Start',
          'Duration (min)',
          'Parts',
          'SLA',
          'Coverage',
          'Created',
        ],
        L.map((w) => [
          w.number,
          this.data.cname(d, w.customerId),
          ...(a.pii ? [d.customers.get(w.customerId)?.phone ?? ''] : []),
          this.data.addr(d, w.siteId, w.customerId),
          w.assetId ? (d.assets.get(w.assetId)?.name ?? '') : '',
          this.data.svName(d, w.serviceTypeId),
          w.priority,
          w.status,
          this.data.tname(d, w.techUserId),
          w.startAt ? this.data.ddate(d, w.startAt) : '',
          hh(this.data.h(d, w)),
          w.durMin,
          this.data.ready(d, w),
          this.data.slaSt(d, w),
          this.data.coverage(d, w),
          w.createdAt.toISOString(),
        ]),
      );
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Export',
      'export',
      what,
      `${what} · ${fmt} · ${out.rows} rows · restricted columns omitted for ${a.roleLabel}`,
    );
    return out;
  }
}
