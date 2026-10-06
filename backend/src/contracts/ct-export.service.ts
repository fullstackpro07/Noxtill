import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  CtActor,
  CtContextService,
  ctErr,
  notFound,
} from './ct-context.service';
import { CtDataService, CtScope } from './ct-data.service';
import { CtViewsService } from './ct-views.service';
import { CT_ERRORS } from './ct.constants';

export interface CtFileOut {
  fileName: string;
  contentType: string;
  body: Buffer;
  rows: number;
}
const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const ts = (d: Date | null | undefined) =>
  d ? d.toISOString().replace('T', ' ').slice(0, 19) : '';
const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : '';

/**
 * Exports respect visibility (branch, restricted records) and rights: referenced values need
 * contracts.value; evidence needs contracts.evidence. Restricted fields are left out, not blanked.
 */
@Injectable()
export class CtExportService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly data: CtDataService,
    private readonly views: CtViewsService,
  ) {}

  private async file(
    format: string,
    title: string,
    head: string[],
    rows: (string | number)[][],
  ): Promise<CtFileOut> {
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
    a: CtActor,
    s: CtScope,
    what: string,
    format: string,
    ids: string[] = [],
  ) {
    this.ctx.need(a, 'export', 'Exporting');
    const d = await this.data.load(a, s);
    const fmt = format === 'xlsx' ? 'xlsx' : 'csv';
    let out: CtFileOut;
    if (what === 'Contract register') {
      if (!a.contracts)
        throw ctErr(
          CT_ERRORS.FORBIDDEN,
          'PERMISSION_DENIED — contracts aren’t available for your role.',
        );
      const L = this.views
        .ctFiltered(d)
        .filter((c) => !ids.length || ids.includes(c.id));
      out = await this.file(
        fmt,
        'Contract register',
        [
          'Contract',
          'Title',
          'Counterparty',
          'Module',
          'Type',
          'Owner',
          'Branch',
          'Start',
          'End',
          'Notice days',
          'Auto-renew',
          'Status',
          'Approval',
          'Signature',
          'Renewal',
          'Risk',
          ...(a.value ? ['Referenced value', 'Currency'] : []),
        ],
        L.map((c) => {
          const p = this.data.party(d, c.cpKind, c.cpId);
          return [
            c.number,
            c.title,
            p.name,
            p.module,
            c.type,
            this.data.name(d, c.ownerId),
            this.data.branchName(d, c.branchId),
            day(c.startOn),
            day(c.endOn),
            c.noticeDays,
            c.autoRenew ? 'Yes' : 'No',
            c.status,
            c.aprState,
            c.sigState,
            this.data.renSt(d, c),
            this.data.risk(d, c),
            ...(a.value
              ? [c.value == null ? '' : Number(c.value), c.currency]
              : []),
          ];
        }),
      );
    } else if (what === 'Expiry report') {
      const L = this.data.expiries(d);
      out = await this.file(
        fmt,
        'Expiry report',
        [
          'Kind',
          'Reference',
          'Title',
          'Type',
          'Owner',
          'Expires (days)',
          'Notice (days)',
          'Auto-renew',
          'Replacement',
          'Status',
        ],
        L.map((e) => [
          e.kind,
          e.ref,
          e.title,
          e.type,
          e.owner,
          e.exp,
          e.notice ?? '',
          e.auto ? 'Yes' : 'No',
          e.repl ? 'Required' : '',
          e.st,
        ]),
      );
    } else if (what === 'Signature evidence') {
      this.ctx.need(a, 'evidence', 'Exporting signature evidence');
      const L = d.sigs.filter(
        (x) =>
          !x.contractId ||
          this.data.ctVisible(
            d,
            d.contracts.find((c) => c.id === x.contractId)!,
          ),
      );
      out = await this.file(
        fmt,
        'Signature evidence',
        [
          'Request',
          'Document',
          'Version',
          'SHA-256',
          'Status',
          'Signer',
          'Email',
          'Role',
          'Auth',
          'Signer status',
          'Sent',
          'Viewed',
          'Signed',
          'Method',
          'IP',
          'User agent',
        ],
        L.flatMap((x) =>
          x.signers.map((y) => [
            x.number,
            d.docs.find((z) => z.id === x.docId)?.number ?? '',
            x.docVersion,
            x.docSha256 ?? '',
            x.status,
            y.name,
            y.email,
            y.role,
            y.auth,
            y.status,
            ts(y.sentAt),
            ts(y.viewedAt),
            ts(y.signedAt),
            y.sigType ?? '',
            y.ip ?? '',
            y.userAgent ?? '',
          ]),
        ),
      );
    } else if (what === 'Compliance evidence') {
      out = await this.file(
        fmt,
        'Compliance evidence',
        [
          'Record',
          'Title',
          'Type',
          'Jurisdiction',
          'Version',
          'Evidence document',
          'SHA-256',
          'Effective',
          'Expiry',
          'Audience',
          'Ack required',
          'Acknowledged',
          'Audience size',
          'Status',
        ],
        d.comp.map((x) => {
          const doc = this.data.doc(d, x.docId);
          const t = this.data.ackTotals(d, x);
          return [
            x.number,
            x.title,
            x.type,
            x.jurisdiction,
            x.version,
            doc?.number ?? '',
            (doc && this.data.cur(doc)?.sha256) ?? '',
            day(x.effectiveOn),
            day(x.expiresOn),
            this.views.audLabel(d, x.audience),
            x.mandatoryAck ? 'Yes' : 'No',
            t.done,
            t.tot,
            this.data.cmpSt(d, x),
          ];
        }),
      );
    } else if (what === 'Audit') {
      const rows = await this.ctx.db.ctAudit.findMany({
        where: { businessId: a.rootId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      out = await this.file(
        fmt,
        'Contracts audit',
        ['When', 'Actor', 'Action', 'Entity', 'Detail', 'Correlation'],
        rows.map((x) => [
          ts(x.createdAt),
          x.actorName,
          x.action,
          x.entityType,
          x.detail,
          x.correlation,
        ]),
      );
    } else {
      const L = this.views
        .docFiltered(d)
        .filter((x) => !ids.length || ids.includes(x.id));
      out = await this.file(
        fmt,
        'Document index',
        [
          'Document',
          'Title',
          'Type',
          'Folder',
          'Owner',
          'Linked module',
          'Linked record',
          'Status',
          'Sensitivity',
          'Version',
          'File',
          'SHA-256',
          'Expiry',
          'Retention',
          'Tags',
          'Updated',
        ],
        L.map((x) => {
          const v = this.data.cur(x);
          return [
            x.number,
            x.title,
            x.type,
            x.folder,
            this.data.name(d, x.ownerId),
            x.linkModule ?? '',
            this.data.linkName(d, x.linkModule, x.linkId),
            x.status,
            x.sensitivity,
            v?.version ?? 1,
            v?.fileName ?? '',
            v?.sha256 ?? '',
            day(x.expiresOn),
            x.retention,
            ((x.tags as string[]) ?? []).join('; '),
            ts(x.updatedAt),
          ];
        }),
      );
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Export',
      'export',
      a.rootId,
      `${what} · ${fmt.toUpperCase()} · ${out.rows} row(s) · filters & permissions applied`,
    );
    return out;
  }

  /** JSON evidence manifest for one completed signature request or compliance record. */
  async pack(
    a: CtActor,
    s: CtScope,
    kind: 'sig' | 'cmp',
    id: string,
  ): Promise<CtFileOut> {
    this.ctx.need(a, 'evidence', 'Downloading evidence packs');
    const d = await this.data.load(a, s);
    let body: unknown;
    let name = '';
    if (kind === 'sig') {
      const x = d.sigs.find((y) => y.id === id || y.number === id);
      if (!x) throw notFound('Signature request');
      const doc = d.docs.find((y) => y.id === x.docId);
      const v = doc?.versions.find((y) => y.version === x.docVersion);
      const ev = await this.ctx.db.ctSignEvent.findMany({
        where: { requestId: x.id },
        orderBy: { createdAt: 'asc' },
      });
      name = x.number;
      body = {
        provider: 'Noxtill eSign (built in)',
        business: d.biz.name,
        request: {
          number: x.number,
          status: x.status,
          ordering: x.ordering,
          sentAt: ts(x.sentAt),
          completedAt: ts(x.completedAt),
          deadline: ts(x.deadline),
        },
        document: {
          number: doc?.number,
          title: doc?.title,
          version: x.docVersion,
          file: v?.fileName,
          sha256Sent: x.docSha256,
          sha256Stored: v?.sha256,
          intact: !!x.docSha256 && v?.sha256 === x.docSha256,
        },
        contract:
          d.contracts.find((c) => c.id === x.contractId)?.number ?? null,
        signers: x.signers.map((y) => ({
          name: y.name,
          email: y.email,
          role: y.role,
          order: y.seq,
          authentication: y.auth,
          status: y.status,
          method: y.sigType,
          sentAt: ts(y.sentAt),
          viewedAt: ts(y.viewedAt),
          signedAt: ts(y.signedAt),
          declinedAt: ts(y.declinedAt),
          declineReason: y.declineReason,
          ip: y.ip,
          userAgent: y.userAgent,
          typedSignature: y.sigType === 'Typed' ? y.sigData : undefined,
          drawnSignaturePng: y.sigType === 'Drawn' ? y.sigData : undefined,
        })),
        events: ev.map((e) => ({
          at: ts(e.createdAt),
          type: e.type,
          detail: e.detail,
          ip: e.ip,
        })),
        generatedAt: ts(new Date()),
        generatedBy: a.name,
      };
    } else {
      const x = d.comp.find((y) => y.id === id || y.number === id);
      if (!x) throw notFound('Compliance record');
      const doc = this.data.doc(d, x.docId);
      name = x.number;
      body = {
        business: d.biz.name,
        record: {
          number: x.number,
          title: x.title,
          type: x.type,
          jurisdiction: x.jurisdiction,
          version: x.version,
          effective: day(x.effectiveOn),
          expiry: day(x.expiresOn),
          audience: this.views.audLabel(d, x.audience),
          status: this.data.cmpSt(d, x),
        },
        evidence: doc
          ? doc.versions.map((v) => ({
              version: v.version,
              file: v.fileName,
              sha256: v.sha256,
              state: v.state,
              locked: v.immutable,
              at: ts(v.createdAt),
            }))
          : [],
        acknowledgements: x.acks.map((k) => ({
          person: this.data.name(d, k.userId),
          version: k.version,
          status: k.status,
          requestedAt: ts(k.requestedAt),
          acknowledgedAt: ts(k.ackedAt),
        })),
        statement:
          'Required evidence present per the configured policy — not a legal opinion.',
        generatedAt: ts(new Date()),
        generatedBy: a.name,
      };
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Evidence pack exported',
      kind === 'sig' ? 'signature' : 'compliance',
      id,
      name,
    );
    return {
      fileName: `evidence-${name}.json`,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(body, null, 2), 'utf8'),
      rows: 1,
    };
  }
}
