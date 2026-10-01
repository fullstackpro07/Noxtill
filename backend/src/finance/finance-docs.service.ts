import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import {
  DigitizerVisionService,
  DigitizerMediaType,
} from '../digitizer/digitizer-vision.service';
import {
  FinActor,
  FinanceContextService,
  num,
  r2,
} from './finance-context.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceTaxService, TaxCalc } from './finance-tax.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceViewsService, ScopeQuery } from './finance-views.service';
import { SOURCE_MODULE } from './finance-sources.service';
import { EVIDENCE_MIME, FIN_ERRORS, MAX_FILE_BYTES } from './finance.constants';
import { Cell, mdy } from './finance-format';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ExportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!,
  );
const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** Evidence files, bill scanning through the Photo Digitizer, and every Finance export. */
@Injectable()
export class FinanceDocsService {
  private readonly logger = new Logger(FinanceDocsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly s3: S3Service,
    private readonly pdf: PdfRendererService,
    private readonly vision: DigitizerVisionService,
    private readonly journals: FinanceJournalsService,
    private readonly ap: FinancePayablesService,
    private readonly tax: FinanceTaxService,
    private readonly close: FinanceCloseService,
    private readonly views: FinanceViewsService,
  ) {}

  // ── evidence ─────────────────────────────────────────────────────────────

  async store(actor: FinActor, area: string, file: UploadedFile) {
    await validateUploadedFile(file, {
      allowedMimeTypes: EVIDENCE_MIME,
      maxSizeBytes: MAX_FILE_BYTES,
    });
    const safe = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-120);
    const key = `finance/${actor.rootId}/${area}/${randomUUID()}-${safe}`;
    await this.s3.upload(key, file.buffer, file.mimetype);
    return {
      key,
      name: file.originalname.slice(0, 160),
      size: file.size,
      type: file.mimetype,
    };
  }

  async attach(actor: FinActor, type: string, id: string, file: UploadedFile) {
    this.ctx.need(actor, 'manage', 'Attaching evidence');
    const f = await this.store(actor, type, file);
    if (type === 'journal') await this.journals.attach(actor, id, f);
    else if (type === 'bill') await this.ap.attach(actor, id, f);
    else if (type === 'tax') await this.tax.attach(actor, id, f);
    else if (type === 'close') await this.close.attach(actor, id, f);
    else if (type === 'recon') {
      const r = await this.prisma.finReconciliation.findFirst({
        where: { id, businessId: actor.rootId },
      });
      if (!r)
        throw new AppException(
          FIN_ERRORS.NOT_FOUND,
          'Reconciliation not found',
          HttpStatus.NOT_FOUND,
        );
      const list = (
        Array.isArray(r.attachments) ? r.attachments : []
      ) as object[];
      await this.prisma.finReconciliation.update({
        where: { id },
        data: {
          attachments: [
            ...list,
            { ...f, by: actor.name, at: new Date().toISOString() },
          ],
        },
      });
      await this.ctx.audit(
        actor.rootId,
        actor,
        'recon.evidence_attached',
        'recon',
        id,
        f.name,
      );
    } else
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Unknown attachment target',
        HttpStatus.BAD_REQUEST,
      );
    return f;
  }

  async downloadUrl(actor: FinActor, key: string) {
    if (!key.startsWith(`finance/${actor.rootId}/`))
      throw new AppException(
        FIN_ERRORS.FORBIDDEN,
        'That file isn’t in this business’s Finance documents.',
        HttpStatus.FORBIDDEN,
      );
    return { url: await this.s3.getSignedDownloadUrl(key, 600) };
  }

  /**
   * Read a supplier invoice with the Photo Digitizer. Returns what the model read and how sure it
   * was; nothing is saved as a bill until a person reviews the fields and saves the draft.
   */
  async scanBill(actor: FinActor, file: UploadedFile) {
    this.ctx.need(actor, 'manage', 'Scanning a bill');
    await validateUploadedFile(file, {
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ],
      maxSizeBytes: MAX_FILE_BYTES,
    });
    const stored = await this.store(actor, 'bill-scans', file);
    const res = await this.vision.extractDocument(
      actor.businessId,
      'invoice',
      file.buffer,
      file.mimetype as DigitizerMediaType,
    );
    const an = res.analysis;
    const docConf =
      an.typeConfidence != null ? Math.round(an.typeConfidence * 100) : null;
    const rowConf = res.rows.length
      ? Math.round(Math.min(...res.rows.map((r) => r.confidence)) * 100)
      : null;
    const conf = (present: boolean) =>
      !present ? 0 : (docConf ?? rowConf ?? 0);
    const ids = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    const supplier = an.supplier
      ? await this.prisma.supplier.findFirst({
          where: {
            businessId: { in: ids },
            name: { contains: an.supplier.split(/\s+/)[0] },
          },
          select: { id: true, name: true },
        })
      : null;
    const total =
      an.totals?.printedTotal ??
      (an.lineItems.length
        ? r2(an.lineItems.reduce((s, l) => s + (l.lineTotal ?? 0), 0))
        : null);
    const tax = an.totals?.tax ?? null;
    return {
      attachment: stored,
      model: an.extractionModel,
      documentKind: an.documentKind,
      vendor: an.supplier,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      invoiceNo: an.invoiceNumber,
      billDate: an.documentDate,
      currency: an.currency,
      subtotal: an.totals?.subtotal ?? null,
      tax,
      total,
      lines: an.lineItems.map((l) => ({
        description: l.description,
        qty: l.quantity,
        unitPrice: l.unitPrice,
        total: l.lineTotal,
      })),
      confidence: {
        vendor: conf(!!an.supplier),
        vinv: conf(!!an.invoiceNumber),
        date: conf(!!an.documentDate),
        amt: conf(total != null),
        tax: conf(tax != null),
        due: 0,
        acct: 0,
        po: 0,
      },
      basis:
        docConf != null
          ? 'Document read confidence reported by the model'
          : rowConf != null
            ? 'Lowest row confidence reported by the model'
            : 'No confidence reported',
    };
  }

  // ── exports ──────────────────────────────────────────────────────────────

  private async build(
    format: string,
    title: string,
    sub: string,
    head: string[],
    rows: string[][],
    right: boolean[],
  ): Promise<ExportFile> {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${title.replace(/[^\w]+/g, '-').toLowerCase()}-${stamp}`;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(title.slice(0, 30));
      ws.addRow([title]).font = { bold: true, size: 13 };
      ws.addRow([sub]);
      ws.addRow([]);
      ws.addRow(head).font = { bold: true };
      for (const r of rows)
        ws.addRow(
          r.map((v, i) =>
            right[i] && /^[−-]?[^\d]*[\d,]+(\.\d+)?$/.test(v)
              ? Number(v.replace(/[^\d.]/g, '')) * (/^[−-]/.test(v) ? -1 : 1)
              : v,
          ),
        );
      ws.columns.forEach(
        (col, i) =>
          (col.width = Math.min(
            60,
            Math.max(
              10,
              ...[head[i] ?? '', ...rows.map((r) => r[i] ?? '')].map(
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
      };
    }
    if (format === 'pdf') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Helvetica,Arial,sans-serif;font-size:10px;color:#101828;margin:24px}h1{font-size:16px;margin:0}p{color:#667085;margin:4px 0 14px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;color:#667085;border-bottom:1px solid #D0D5DD;padding:5px 4px}td{padding:5px 4px;border-bottom:1px solid #F2F4F7}.r{text-align:right}</style></head><body><h1>${esc(title)}</h1><p>${esc(sub)}</p><table><thead><tr>${head.map((h, i) => `<th class="${right[i] ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${right[i] ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      return {
        fileName: `${base}.pdf`,
        contentType: 'application/pdf',
        body: await this.pdf.renderPdf(html),
      };
    }
    const csv = [head, ...rows]
      .map((r) => r.map((v) => csvCell(v ?? '')).join(','))
      .join('\n');
    return {
      fileName: `${base}.csv`,
      contentType: 'text/csv',
      body: Buffer.from('﻿' + csv, 'utf8'),
    };
  }

  private cellText(c: Cell) {
    return c.t;
  }

  async exportScreen(
    actor: FinActor,
    key: string,
    format: string,
    q: ScopeQuery,
  ): Promise<ExportFile> {
    const c = await this.views.scope(actor, q);
    if (key === 'gl') {
      const { rows } = await this.views.glLines(c, q, 50_000);
      const head = [
        'Posting date',
        'Journal #',
        'Account',
        'Description',
        'Debit',
        'Credit',
        'Currency',
        'Txn debit',
        'Txn credit',
        'Branch',
        'Source',
        'Source record',
      ];
      const data = rows.map((g) => [
        g.date.toISOString().slice(0, 10),
        g.journal.number,
        `${c.byId.get(g.accountId ?? '')?.code ?? ''} ${c.byId.get(g.accountId ?? '')?.name ?? ''}`,
        g.description ?? '',
        num(g.debit).toFixed(2),
        num(g.credit).toFixed(2),
        g.currency,
        num(g.txnDebit).toFixed(2),
        num(g.txnCredit).toFixed(2),
        c.branches.find((b) => b.id === g.branchId)?.name ?? '',
        g.journal.sourceType
          ? (SOURCE_MODULE[g.journal.sourceType] ?? g.journal.sourceType)
          : 'Manual',
        g.journal.sourceLabel ?? '',
      ]);
      await this.ctx.audit(
        actor.rootId,
        actor,
        'export.gl',
        'export',
        key,
        `${data.length} lines · ${format}`,
      );
      return this.build(
        format,
        'General Ledger',
        `${c.entity} · ${c.range.label} · posted lines`,
        head,
        data,
        [
          false,
          false,
          false,
          false,
          true,
          true,
          false,
          true,
          true,
          false,
          false,
          false,
        ],
      );
    }
    if (key === 'statements') {
      const s = (await this.views.statements(c, q)).stmt;
      const head = [
        'Line',
        s.hA,
        ...(s.showB ? [s.hB] : []),
        ...(s.showC ? [s.hC] : []),
      ];
      const data = s.rows.map((r) => [
        r.kind === 'line' ? `   ${r.l}` : r.l,
        r.a,
        ...(s.showB ? [r.b] : []),
        ...(s.showC ? [r.c] : []),
      ]);
      if (s.check) data.push([`Integrity check passed · ${s.check}`, '']);
      await this.ctx.audit(
        actor.rootId,
        actor,
        'export.statement',
        'export',
        s.type,
        format,
      );
      return this.build(
        format,
        s.title,
        `${s.sub} · ${s.basis}`,
        head,
        data,
        head.map((_, i) => i > 0),
      );
    }
    const screen = (await this.views.screen(actor, key, q)) as {
      table?: {
        title: string;
        cols: [string, number?][];
        rows: { cells: Cell[] }[];
      } | null;
    };
    const t = screen.table;
    if (!t)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Nothing to export on this screen.',
        HttpStatus.BAD_REQUEST,
      );
    const cols = t.cols
      .map((col, i) => ({ l: col[0], i, r: !!col[1] }))
      .filter((x) => x.l);
    const data = t.rows.map((r) =>
      cols.map((col) => {
        const cell = r.cells[col.i];
        return cell
          ? `${this.cellText(cell)}${cell.sub && !cell.isChip ? ` (${cell.sub})` : ''}`
          : '';
      }),
    );
    await this.ctx.audit(
      actor.rootId,
      actor,
      `export.${key}`,
      'export',
      key,
      `${data.length} rows · ${format}`,
    );
    return this.build(
      format,
      t.title,
      `${c.entity} · ${c.range.label}`,
      cols.map((x) => x.l),
      data,
      cols.map((x) => x.r),
    );
  }

  async exportJournal(
    actor: FinActor,
    id: string,
    format: string,
  ): Promise<ExportFile> {
    const j = await this.prisma.finJournal.findFirst({
      where: { id, businessId: actor.rootId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!j)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Journal not found',
        HttpStatus.NOT_FOUND,
      );
    const maps = await this.ctx.accountMaps(actor.rootId);
    const rows = j.lines.map((l) => [
      String(l.lineNo),
      `${maps.byId.get(l.accountId ?? '')?.code ?? ''} ${maps.byId.get(l.accountId ?? '')?.name ?? ''}`,
      l.description ?? '',
      num(l.debit).toFixed(2),
      num(l.credit).toFixed(2),
      l.department ?? '',
    ]);
    return this.build(
      format,
      j.number,
      `${j.memo ?? ''} · ${mdy(j.date)} · ${j.status}`,
      ['#', 'Account', 'Description', 'Debit', 'Credit', 'Department'],
      rows,
      [false, false, false, true, true, false],
    );
  }

  /** The filing pack: return summary, exceptions and every tax line behind it. */
  async exportTax(
    actor: FinActor,
    id: string,
    format: string,
  ): Promise<ExportFile> {
    const r = await this.tax.mustReturn(actor.rootId, id);
    const calc =
      (r.snapshot as unknown as TaxCalc | null) ??
      (await this.tax.calc(
        actor.rootId,
        r.jurisdiction,
        r.periodStart,
        r.periodEnd,
      ));
    const maps = await this.ctx.accountMaps(actor.rootId);
    const lines = await this.prisma.finJournalLine.findMany({
      where: {
        businessId: actor.rootId,
        ...(r.jurisdiction === actor.rootId
          ? { OR: [{ branchId: r.jurisdiction }, { branchId: null }] }
          : { branchId: r.jurisdiction }),
        postedAt: { not: null },
        date: { gte: r.periodStart, lte: r.periodEnd },
        accountId: {
          in: [
            maps.byKey.get('output_tax')!.id,
            maps.byKey.get('input_tax')!.id,
          ],
        },
      },
      include: { journal: { select: { number: true, sourceLabel: true } } },
      orderBy: { date: 'asc' },
    });
    const rows: string[][] = [
      ['Taxable base', calc.base.toFixed(2), ''],
      ['Output tax', calc.output.toFixed(2), ''],
      ['Input tax', calc.input.toFixed(2), ''],
      ['Net liability', calc.net.toFixed(2), ''],
      ['', '', ''],
      ...calc.exceptions.map((e) => [
        `Exception: ${e.ref}`,
        e.amount.toFixed(2),
        e.what,
      ]),
      ['', '', ''],
      ...lines.map((l) => [
        `${l.date.toISOString().slice(0, 10)} ${l.journal.number}`,
        (num(l.credit) - num(l.debit)).toFixed(2),
        `${l.accountId === maps.byKey.get('output_tax')!.id ? 'Output' : 'Input'} · ${l.journal.sourceLabel ?? l.description ?? ''}`,
      ]),
    ];
    await this.ctx.audit(
      actor.rootId,
      actor,
      'tax.filing_pack_exported',
      'tax',
      id,
      format,
    );
    return this.build(
      format,
      `Tax return ${r.number}`,
      `${mdy(r.periodStart)} – ${mdy(r.periodEnd)} · status ${r.status}${r.filingRef ? ` · filed ref ${r.filingRef}` : ''}`,
      ['Item', 'Amount', 'Detail'],
      rows,
      [false, true, false],
    );
  }
}
