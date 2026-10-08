import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { dayKey } from '../field-service/fs-time';
import { PpActor, PpContextService, num, ppErr } from './pp-context.service';
import { Calc, PpDataService, PpScope, periodLabel } from './pp-data.service';
import { PP_ERRORS } from './pp.constants';

type Col = { header: string; key: string; width?: number };
const csvCell = (v: unknown) => {
  const s =
    v == null
      ? ''
      : typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? v.toString()
          : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV / XLSX exports. Salary and identifiers follow the exporter's rights; every export is audited. */
@Injectable()
export class PpExportService {
  constructor(
    private readonly ctx: PpContextService,
    private readonly X: PpDataService,
  ) {}

  async export(
    a: PpActor,
    s: PpScope,
    what: string,
    format: string,
    full: boolean,
  ) {
    this.ctx.need(a, 'export', 'Exporting');
    const sal = full && a.salary;
    const d = await this.X.load(a, s);
    const X = this.X;
    let cols: Col[] = [];
    let rows: Record<string, unknown>[] = [];
    switch (what) {
      case 'employees':
        cols = [
          { header: 'Name', key: 'n', width: 26 },
          { header: 'Department', key: 'dept', width: 18 },
          { header: 'Title', key: 't', width: 22 },
          { header: 'Branch', key: 'br', width: 18 },
          { header: 'Type', key: 'type' },
          { header: 'Status', key: 'st' },
          { header: 'Manager', key: 'mgr', width: 22 },
          { header: 'Start date', key: 'sd' },
          { header: 'Pay basis', key: 'basis' },
          ...(sal ? [{ header: 'Pay rate', key: 'rate' }] : []),
          { header: 'In payroll', key: 'inp' },
        ];
        rows = X.staffV(d).map((e) => ({
          n: e.name,
          dept: e.dept,
          t: e.title,
          br: X.brName(d, e.branchId),
          type: e.type,
          st: e.status,
          mgr: e.mgr ? X.name(d, e.mgr) : '',
          sd: dayKey(e.start, d.tz),
          basis: e.basis ?? '',
          rate: e.rate ?? '',
          inp: e.inPayroll ? 'Yes' : 'No',
        }));
        break;
      case 'readiness': {
        this.ctx.need(a, 'payroll', 'Exporting payroll readiness');
        cols = [
          { header: 'Input', key: 't', width: 24 },
          { header: 'State', key: 'st' },
          { header: 'Count', key: 'n' },
          { header: 'Affected', key: 'who', width: 50 },
          { header: 'Source', key: 'src', width: 18 },
        ];
        rows = (await X.readiness(d)).map((x) => ({
          t: x.t,
          st: x.st,
          n: x.n,
          who: x.who.map((u) => X.name(d, u)).join('; ') || x.note,
          src: x.src,
        }));
        break;
      }
      case 'run': {
        if (!a.payroll && !a.payApprove && !a.salary)
          this.ctx.need(a, 'payroll', 'Exporting payroll runs');
        const r =
          d.runs.find((x) => x.id === s.run || x.number === s.run) ??
          X.curRun(d);
        if (!r) throw ppErr(PP_ERRORS.NOT_FOUND, 'No payroll run to export.');
        cols = [
          { header: 'Run', key: 'run' },
          { header: 'Period', key: 'p' },
          { header: 'Employee', key: 'n', width: 26 },
          ...(a.salary
            ? [
                'Regular',
                'Overtime',
                'Commission',
                'Additions',
                'Allowances',
                'Gross',
                'Pre-tax',
                'Tax',
                'Post-tax',
                'Advances',
                'Net',
                'Employer',
                'Employer cost',
              ].map((h) => ({ header: h, key: h }))
            : []),
          { header: 'Payout', key: 'po' },
          { header: 'Bank ref', key: 'ref' },
        ];
        rows = r.lines.map((l) => {
          const c = l.calc as unknown as Calc;
          return {
            run: r.number,
            p: periodLabel(r.period),
            n: X.name(d, l.userId),
            Regular: c.regular,
            Overtime: c.ot,
            Commission: c.comm,
            Additions: c.bonus,
            Allowances: c.allow,
            Gross: c.gross,
            'Pre-tax': c.pre,
            Tax: c.tax,
            'Post-tax': c.post,
            Advances: c.adv,
            Net: c.net,
            Employer: c.er,
            'Employer cost': c.cost,
            po: l.payout,
            ref: l.payoutRef ?? '',
          };
        });
        break;
      }
      case 'leave':
        cols = [
          { header: 'Number', key: 'no' },
          { header: 'Employee', key: 'n', width: 24 },
          { header: 'Type', key: 't' },
          { header: 'From', key: 's' },
          { header: 'To', key: 'e' },
          { header: 'Days', key: 'd' },
          { header: 'Status', key: 'st' },
          { header: 'Approver', key: 'apr', width: 22 },
        ];
        rows = d.leaves
          .filter((l) => X.inScope(d, l.uid))
          .map((l) => ({
            no: l.number,
            n: X.name(d, l.uid),
            t: X.ltName(d, l.type),
            s: l.sKey,
            e: l.eKey,
            d: l.days,
            st: l.status,
            apr: l.apr ? X.name(d, l.apr) : '',
          }));
        break;
      case 'candidates':
        this.ctx.need(a, 'recruit', 'Exporting candidates');
        cols = [
          { header: 'Number', key: 'no' },
          { header: 'Name', key: 'n', width: 24 },
          ...(a.pii && full ? [{ header: 'Email', key: 'em', width: 26 }] : []),
          { header: 'Job', key: 'j', width: 24 },
          { header: 'Stage', key: 'st' },
          { header: 'Source', key: 'src' },
          { header: 'Applied', key: 'ap' },
          { header: 'Consent', key: 'c' },
        ];
        rows = d.cands.map((c) => ({
          no: c.number,
          n: c.name,
          em: c.email,
          j: X.job(d, c.jobId)?.title ?? '',
          st: c.stage,
          src: c.source,
          ap: dayKey(c.appliedAt, d.tz),
          c: c.consent,
        }));
        break;
      case 'jobs':
        cols = [
          { header: 'Number', key: 'no' },
          { header: 'Title', key: 't', width: 26 },
          { header: 'Department', key: 'dept' },
          { header: 'Branch', key: 'br' },
          { header: 'Status', key: 'st' },
          { header: 'Target', key: 'tg' },
          { header: 'Candidates', key: 'c' },
          ...((a.comp || a.salary) && full
            ? [
                { header: 'Comp min', key: 'min' },
                { header: 'Comp max', key: 'max' },
              ]
            : []),
        ];
        rows = d.jobs.map((j) => ({
          no: j.number,
          t: j.title,
          dept: j.department,
          br: X.brName(d, j.branchId),
          st: j.status,
          tg: j.target,
          c: d.cands.filter((c) => c.jobId === j.id).length,
          min: j.compMin != null ? num(j.compMin) : '',
          max: j.compMax != null ? num(j.compMax) : '',
        }));
        break;
      case 'training':
        cols = [
          { header: 'Number', key: 'no' },
          { header: 'Employee', key: 'n', width: 24 },
          { header: 'Course', key: 'c', width: 26 },
          { header: 'Due', key: 'due' },
          { header: 'Status', key: 'st' },
          { header: 'Score', key: 'sc' },
          { header: 'Certificate expires', key: 'ce' },
        ];
        rows = d.tas
          .filter((t) => X.inScope(d, t.userId))
          .map((t) => ({
            no: t.number,
            n: X.name(d, t.userId),
            c: X.course(d, t.courseId)?.name ?? '',
            due: dayKey(t.dueOn, 'UTC'),
            st: X.taStatus(d, t),
            sc: t.score != null ? num(t.score) : '',
            ce: t.certExpires ? dayKey(t.certExpires, 'UTC') : '',
          }));
        break;
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown export.');
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Export',
      'export',
      a.rootId,
      `${what} · ${format} · ${rows.length} rows · ${sal || (full && (a.pii || a.comp)) ? 'includes sensitive fields' : 'masked'}`,
    );
    const name = `people-${what}-${d.today}`;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(what.slice(0, 30));
      ws.columns = cols.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 14,
      }));
      ws.addRows(rows);
      return {
        body: Buffer.from(await wb.xlsx.writeBuffer()),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${name}.xlsx`,
        rows: rows.length,
      };
    }
    const csv = [
      cols.map((c) => csvCell(c.header)).join(','),
      ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(',')),
    ].join('\n');
    return {
      body: Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(csv, 'utf8'),
      ]),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${name}.csv`,
      rows: rows.length,
    };
  }
}
