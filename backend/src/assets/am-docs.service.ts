import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AmActor, AmContextService, amErr, num } from './am-context.service';
import { AmAssetsService } from './am-assets.service';
import { AmDataService, AmScope } from './am-data.service';
import { AmViewsService } from './am-views.service';
import { AM_ERRORS, CONDITIONS, LEVELS, OWNER_TYPES } from './am.constants';

export interface AmFile {
  fileName: string;
  contentType: string;
  body: Buffer;
  rows: number;
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** Column header → asset field. Matching is case/space-insensitive. */
const COLS: Record<string, string> = {
  name: 'name',
  assetname: 'name',
  number: 'number',
  assetnumber: 'number',
  tag: 'tag',
  assettag: 'tag',
  serial: 'serial',
  serialnumber: 'serial',
  barcode: 'barcode',
  manufacturer: 'manufacturer',
  model: 'model',
  category: 'category',
  location: 'location',
  branch: 'branch',
  condition: 'condition',
  criticality: 'criticality',
  status: 'status',
  ownertype: 'ownerType',
  owner: 'ownerType',
  purchasedate: 'purchasedOn',
  installdate: 'installedOn',
  purchasecost: 'cost',
  cost: 'cost',
  warrantyprovider: 'warrantyProvider',
  warrantytype: 'warrantyType',
  warrantyexpiry: 'warrantyEnd',
  metertype: 'meterType',
};

export interface ImportRow {
  row: number;
  data: Record<string, string>;
  status: 'new' | 'match' | 'error' | 'blank';
  why: string;
}

/** Asset import (CSV/XLSX → validate → duplicate review → commit) and exports. */
@Injectable()
export class AmDocsService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly data: AmDataService,
    private readonly views: AmViewsService,
    private readonly assets: AmAssetsService,
  ) {}

  private async file(
    format: string,
    title: string,
    head: string[],
    rows: (string | number)[][],
  ): Promise<AmFile> {
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

  async export(a: AmActor, s: AmScope, what: string, format: string) {
    if (!a.export)
      throw amErr(
        AM_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — exporting needs “assets.export”.',
        HttpStatus.FORBIDDEN,
      );
    const d = await this.data.load(a, s);
    const cost = a.cost;
    let out: AmFile;
    if (what === 'register') {
      const L = this.views.regFiltered(d);
      out = await this.file(
        format,
        'Asset register',
        [
          'Asset #',
          'Name',
          'Tag',
          'Serial',
          'Barcode',
          'Manufacturer',
          'Model',
          'Category',
          'Owner',
          'Branch',
          'Location',
          'Status',
          'Condition',
          'Criticality',
          'Health',
          'Next maintenance',
          'Warranty expiry',
          ...(cost ? ['Purchase cost', 'Maintenance cost'] : []),
        ],
        L.map((x) => {
          const n = this.data.nextDue(d, x.id);
          const h = this.data.health(d, x);
          return [
            x.number,
            x.name,
            x.tag ?? '',
            x.serial ?? '',
            x.barcode ?? '',
            x.manufacturer ?? '',
            x.model ?? '',
            this.data.catName(d, x.categoryId),
            x.ownerType,
            this.data.branchName(d, x.branchId),
            this.data.locPath(d, x.locationId, x.branchId),
            x.status,
            x.condition,
            x.criticality,
            h.score == null ? 'Unknown' : `${h.score} ${h.band}`,
            n
              ? `${n.name} · ${n.nextDueOn ? n.nextDueOn.toISOString().slice(0, 10) : 'by meter'}`
              : '',
            x.warrantyEnd ? x.warrantyEnd.toISOString().slice(0, 10) : '',
            ...(cost
              ? [
                  num(x.cost),
                  d.wos
                    .filter((w) => w.assetId === x.id)
                    .reduce((t, w) => t + this.data.woCost(w), 0),
                ]
              : []),
          ];
        }),
      );
    } else if (what === 'workorders') {
      const W = d.wos.filter((w) => d.ids.has(w.assetId));
      out = await this.file(
        format,
        'Maintenance work orders',
        [
          'MWO #',
          'Asset',
          'Type',
          'Priority',
          'Status',
          'Assignee',
          'Due',
          'Started',
          'Completed',
          'Outcome',
          ...(cost ? ['Cost'] : []),
        ],
        W.map((w) => [
          w.number,
          this.data.A(d, w.assetId)?.number ?? '',
          w.type,
          w.priority,
          w.status,
          this.data.assignee(d, w),
          w.dueAt.toISOString().slice(0, 10),
          w.startedAt?.toISOString().slice(0, 16) ?? '',
          w.completedAt?.toISOString().slice(0, 16) ?? '',
          w.outcome ?? '',
          ...(cost ? [this.data.woCost(w)] : []),
        ]),
      );
    } else if (what === 'analytics' || what === 'downtime') {
      const P0 = this.data.periodStart(d);
      out = await this.file(
        format,
        `Asset reliability ${d.s.period}d`,
        [
          'Asset #',
          'Name',
          'Category',
          'Availability %',
          'Unplanned h',
          'Planned h',
          'Failures',
          'MTBF h',
          'MTTR h',
          'Condition',
          ...(cost ? ['Maintenance cost'] : []),
        ],
        d.assets
          .filter((x) => x.status !== 'Archived')
          .map((x) => {
            const m = this.data.metrics(d, x.id);
            return [
              x.number,
              x.name,
              this.data.catName(d, x.categoryId),
              m.avail.toFixed(2),
              m.uh.toFixed(1),
              m.ph.toFixed(1),
              m.f,
              m.mtbf == null ? 'Insufficient data' : m.mtbf.toFixed(1),
              m.mttr == null ? 'Insufficient data' : m.mttr.toFixed(1),
              x.condition,
              ...(cost
                ? [
                    d.wos
                      .filter(
                        (w) =>
                          w.assetId === x.id &&
                          w.completedAt &&
                          w.completedAt.getTime() > P0,
                      )
                      .reduce((t, w) => t + this.data.woCost(w), 0),
                  ]
                : []),
            ];
          }),
      );
    } else if (what === 'history') {
      const R = this.views
        .histRows(d)
        .sort((p, q) => q.at.getTime() - p.at.getTime());
      out = await this.file(
        format,
        'Asset history',
        ['Date', 'Asset', 'Event', 'Summary', 'Condition', 'Result', 'By'],
        R.map((r) => [
          r.at.toISOString().slice(0, 16),
          this.data.A(d, r.asset)?.number ?? '',
          r.type,
          r.summary,
          r.cond,
          r.result,
          this.data.person(d, r.by),
        ]),
      );
    } else throw amErr(AM_ERRORS.INVALID, 'Unknown export.');
    await this.ctx.audit(
      a.rootId,
      a,
      'Sensitive export',
      'export',
      a.rootId,
      `${what} · ${format.toUpperCase()} · ${out.rows} rows${cost ? ' · incl. cost' : ' · cost columns excluded'}`,
    );
    return out;
  }

  // ── import ────────────────────────────────────────────────────────────

  async parse(buf: Buffer, name: string) {
    const rows: string[][] = [];
    if (/\.xlsx$/i.test(name)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      ws?.eachRow({ includeEmpty: true }, (r) => {
        const vals = (r.values as unknown[]).slice(1).map((v) => {
          if (v == null) return '';
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === 'object' && 'text' in v) return String(v.text);
          if (typeof v === 'object' && 'result' in v) return String(v.result);
          return typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean'
            ? String(v)
            : '';
        });
        rows.push(vals);
      });
    } else {
      let text = buf.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      let cur: string[] = [];
      let f = '';
      let q = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
          if (c === '"' && text[i + 1] === '"') {
            f += '"';
            i++;
          } else if (c === '"') q = false;
          else f += c;
        } else if (c === '"') q = true;
        else if (c === ',') {
          cur.push(f);
          f = '';
        } else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          cur.push(f);
          rows.push(cur);
          cur = [];
          f = '';
        } else f += c;
      }
      if (f || cur.length) {
        cur.push(f);
        rows.push(cur);
      }
    }
    return rows;
  }

  /** Validates every row without writing anything. Matches on tag/serial/barcode are held, never overwritten. */
  async preview(a: AmActor, buf: Buffer, name: string) {
    this.ctx.need(a, 'create', 'Importing assets');
    if (!buf?.length)
      throw amErr(AM_ERRORS.INVALID, 'Choose a CSV or XLSX file.');
    if (buf.length > 5 * 1024 * 1024)
      throw amErr(AM_ERRORS.INVALID, 'Import files are limited to 5 MB.');
    const raw = await this.parse(buf, name);
    if (raw.length < 2)
      throw amErr(
        AM_ERRORS.INVALID,
        'The file needs a header row and at least one asset row.',
      );
    const head = raw[0].map(
      (h) => COLS[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null,
    );
    if (!head.includes('name'))
      throw amErr(
        AM_ERRORS.INVALID,
        'No “Asset name” (or “Name”) column found.',
      );
    if (raw.length > 2001)
      throw amErr(AM_ERRORS.INVALID, 'Import up to 2,000 rows at a time.');
    const rootId = a.rootId;
    const cfg = await this.ctx.config(rootId);
    const [cats, locs, group, existing] = await Promise.all([
      this.ctx.db.amCategory.findMany({ where: { businessId: rootId } }),
      this.ctx.db.amLocation.findMany({ where: { businessId: rootId } }),
      this.ctx.branches(rootId),
      this.ctx.db.amAsset.findMany({
        where: { businessId: rootId },
        select: { number: true, tag: true, serial: true, barcode: true },
      }),
    ]);
    const seen = new Set<string>();
    const out: ImportRow[] = raw.slice(1).map((cells, i) => {
      const data: Record<string, string> = {};
      head.forEach((k, j) => {
        if (k) data[k] = (cells[j] ?? '').trim();
      });
      const r: ImportRow = { row: i + 2, data, status: 'new', why: '' };
      if (!Object.values(data).some(Boolean))
        return { ...r, status: 'blank', why: 'Blank row' };
      const errs: string[] = [];
      if (!data.name) errs.push('missing asset name');
      if (
        data.category &&
        !cats.some(
          (c) =>
            c.name.toLowerCase() === data.category.toLowerCase() ||
            c.code.toLowerCase() === data.category.toLowerCase(),
        )
      )
        errs.push(`unknown category “${data.category}”`);
      if (
        data.location &&
        !locs.some(
          (l) =>
            l.code.toLowerCase() === data.location.toLowerCase() ||
            l.name.toLowerCase() === data.location.toLowerCase(),
        )
      )
        errs.push(`unknown location “${data.location}”`);
      if (
        data.branch &&
        !group.some((g) => g.name.toLowerCase() === data.branch.toLowerCase())
      )
        errs.push(`unknown branch “${data.branch}”`);
      if (data.condition && !CONDITIONS.includes(data.condition as never))
        errs.push('bad condition');
      if (data.criticality && !LEVELS.includes(data.criticality as never))
        errs.push('bad criticality');
      if (data.ownerType && !OWNER_TYPES.includes(data.ownerType as never))
        errs.push('bad owner type');
      if (data.ownerType === 'Customer-owned')
        errs.push(
          'customer-owned assets need a CRM customer — add them in the app',
        );
      if (
        data.status &&
        !['Draft', 'Active', 'In Storage'].includes(data.status)
      )
        errs.push('status must be Draft, Active or In Storage');
      if (data.meterType && !cfg.meters.includes(data.meterType))
        errs.push('unknown meter type');
      if (data.cost && !(Number(data.cost) >= 0))
        errs.push('cost must be a number');
      for (const k of ['purchasedOn', 'installedOn', 'warrantyEnd'])
        if (data[k] && !/^\d{4}-\d{2}-\d{2}/.test(data[k]))
          errs.push(`${k} must be YYYY-MM-DD`);
      if (errs.length) return { ...r, status: 'error', why: errs.join('; ') };
      const keys = [
        data.tag && `t:${data.tag}`,
        data.serial && `s:${data.serial}`,
        data.barcode && `b:${data.barcode}`,
        data.number && `n:${data.number}`,
      ].filter(Boolean);
      const hit = existing.find(
        (x) =>
          (data.tag && x.tag === data.tag) ||
          (data.serial && x.serial === data.serial) ||
          (data.barcode && x.barcode === data.barcode) ||
          (data.number && x.number === data.number),
      );
      if (hit)
        return {
          ...r,
          status: 'match',
          why: `matches existing ${hit.number} — held for review, not overwritten`,
        };
      if (keys.some((k) => seen.has(k)))
        return {
          ...r,
          status: 'match',
          why: 'duplicates another row in this file',
        };
      keys.forEach((k) => seen.add(k));
      return r;
    });
    const mapped = raw[0].filter((_, j) => head[j]);
    return {
      rows: out,
      summary: {
        total: out.length,
        ready: out.filter((r) => r.status === 'new').length,
        held: out.filter((r) => r.status === 'match').length,
        failed: out.filter((r) => r.status === 'error').length,
        blank: out.filter((r) => r.status === 'blank').length,
        mapped,
        ignored: raw[0].filter((_, j) => !head[j]),
      },
    };
  }

  async commit(a: AmActor, buf: Buffer, name: string) {
    const p = await this.preview(a, buf, name);
    const cats = await this.ctx.db.amCategory.findMany({
      where: { businessId: a.rootId },
    });
    const locs = await this.ctx.db.amLocation.findMany({
      where: { businessId: a.rootId },
    });
    const group = await this.ctx.branches(a.rootId);
    const made: string[] = [];
    const failed: string[] = [];
    for (const r of p.rows.filter((z) => z.status === 'new')) {
      const x = r.data;
      try {
        const cat = x.category
          ? cats.find(
              (c) =>
                c.name.toLowerCase() === x.category.toLowerCase() ||
                c.code.toLowerCase() === x.category.toLowerCase(),
            )
          : null;
        const loc = x.location
          ? locs.find(
              (l) =>
                l.code.toLowerCase() === x.location.toLowerCase() ||
                l.name.toLowerCase() === x.location.toLowerCase(),
            )
          : null;
        const br = x.branch
          ? group.find((g) => g.name.toLowerCase() === x.branch.toLowerCase())
          : null;
        const row = await this.assets.create(a, {
          name: x.name,
          number: x.number || undefined,
          tag: x.tag,
          serial: x.serial,
          barcode: x.barcode,
          manufacturer: x.manufacturer,
          model: x.model,
          categoryId: cat?.id,
          locationId: loc?.id,
          branchId: br?.id,
          condition: x.condition || undefined,
          criticality: x.criticality || undefined,
          status: x.status || undefined,
          ownerType: x.ownerType || undefined,
          purchasedOn: x.purchasedOn,
          installedOn: x.installedOn,
          cost: x.cost ? Number(x.cost) : undefined,
          warrantyProvider: x.warrantyProvider,
          warrantyType: x.warrantyType,
          warrantyEnd: x.warrantyEnd,
          meterType: x.meterType,
        });
        made.push(row.number);
      } catch (e) {
        failed.push(`row ${r.row}: ${(e as Error).message}`);
      }
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Import',
      'asset',
      a.rootId,
      `${made.length} created · ${p.summary.held} held for review · ${p.summary.failed + failed.length} failed · ${p.summary.blank} skipped`,
    );
    return {
      created: made,
      held: p.rows.filter((z) => z.status === 'match'),
      failed: [
        ...p.rows
          .filter((z) => z.status === 'error')
          .map((z) => `row ${z.row}: ${z.why}`),
        ...failed,
      ],
    };
  }
}
