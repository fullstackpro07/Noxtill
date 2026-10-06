import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailService } from '../messaging/channels/email.service';
import { ProjectTasksService } from '../projects/project-tasks.service';
import {
  CtActor,
  CtContextService,
  Party,
  Tx,
  ctErr,
  notFound,
  num,
} from './ct-context.service';
import { CtFilesService, Upload } from './ct-files.service';
import { CtApprovalsService } from './ct-approvals.service';
import { CtTemplatesService } from './ct-templates.service';
import { CT_ERRORS, CT_T, CT_TYPES, LIVE } from './ct.constants';

export interface WizardIn {
  src?: string;
  templateId?: string | null;
  title?: string;
  type?: string;
  cp?: string;
  contact?: string;
  start?: string;
  end?: string | null;
  notice?: number | string;
  autoRenew?: boolean | string;
  value?: number | string | null;
  refs?: string;
  body?: string;
  signer?: string;
  email?: string;
  order?: string;
  auth?: string;
  branchId?: string | null;
}

export type Related = { module: string; ref: string; id: string };
const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const yes = (v: unknown) => v === true || v === '1' || v === 'true';
const FREQ: Record<string, number> = { Monthly: 1, Quarterly: 3, Annual: 12 };
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

/** Contract register & lifecycle. Every status change goes through CT_T; signed originals are never edited. */
@Injectable()
export class CtContractsService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly files: CtFilesService,
    private readonly approvals: CtApprovalsService,
    private readonly templates: CtTemplatesService,
    private readonly tasks: ProjectTasksService,
    private readonly email: EmailService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async get(a: CtActor, id: string) {
    const c = await this.db.ctContract.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
      include: { terms: true, obls: true, amends: true },
    });
    if (!c) throw notFound('Contract');
    if (!a.contracts)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — contracts aren’t available for your role.',
        HttpStatus.FORBIDDEN,
      );
    if (c.restricted && !a.restricted)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — restricted contract. Knowing the ID isn’t enough.',
        HttpStatus.FORBIDDEN,
      );
    if (a.branches && c.branchId && !a.branches.includes(c.branchId))
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — this contract belongs to another branch.',
        HttpStatus.FORBIDDEN,
      );
    return c;
  }

  async move(
    a: CtActor,
    c: { id: string; number: string; status: string },
    to: string,
    data: Prisma.CtContractUpdateInput = {},
    why = '',
    tx?: Tx,
  ) {
    if (!(CT_T[c.status] ?? []).includes(to))
      throw ctErr(
        CT_ERRORS.STATUS,
        `INVALID_STATUS_TRANSITION — ${c.number} can’t go ${c.status} → ${to}.`,
      );
    const db = tx ?? this.db;
    const n = await db.ctContract.updateMany({
      where: { id: c.id, status: c.status },
      data: {
        ...(data as Prisma.CtContractUpdateManyMutationInput),
        status: to,
        version: { increment: 1 },
      },
    });
    if (!n.count)
      throw ctErr(
        CT_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${c.number} changed a moment ago. Reload and try again.`,
        HttpStatus.CONFLICT,
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Contract status changed',
      'contract',
      c.id,
      `${c.number}: ${c.status} → ${to}${why ? ` · ${why}` : ''}`,
      { tx },
    );
  }

  // ── references ────────────────────────────────────────────────────────

  /** Resolves "ORD-5231, PRJ-12, AGR-003, AST-0004" to real records — unknown references are refused. */
  async refs(a: CtActor, raw: string | undefined): Promise<Related[]> {
    const list = (raw ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const group = (await this.ctx.branches(a.rootId)).map((g) => g.id);
    const out: Related[] = [];
    for (const r of list) {
      const ord = /^(?:ORD-|#)?(\d+)$/i.exec(r);
      if (ord) {
        const o = await this.db.order.findFirst({
          where: { businessId: { in: group }, orderNo: Number(ord[1]) },
          select: { id: true },
        });
        if (o) {
          out.push({ module: 'Orders', ref: `#${ord[1]}`, id: o.id });
          continue;
        }
      }
      const prj = await this.db.project.findFirst({
        where: { businessId: { in: group }, number: r },
        select: { id: true, number: true },
      });
      if (prj) {
        out.push({ module: 'Projects & Tasks', ref: prj.number, id: prj.id });
        continue;
      }
      const agr = await this.db.fsAgreement.findFirst({
        where: { businessId: a.rootId, number: r },
        select: { id: true, number: true },
      });
      if (agr) {
        out.push({ module: 'Field Service', ref: agr.number, id: agr.id });
        continue;
      }
      const ast = await this.db.amAsset.findFirst({
        where: { businessId: a.rootId, number: r },
        select: { id: true, number: true },
      });
      if (ast) {
        out.push({
          module: 'Assets & Maintenance',
          ref: ast.number,
          id: ast.id,
        });
        continue;
      }
      throw ctErr(
        CT_ERRORS.INVALID,
        `No order, project, service agreement or asset is numbered “${r}”.`,
      );
    }
    return out;
  }

  private async party(a: CtActor, cp: string | undefined): Promise<Party> {
    const [kind, id] = (cp ?? '').split(':');
    const p = (await this.ctx.parties(a.rootId)).find(
      (x) => x.kind === kind && x.id === id,
    );
    if (!p)
      throw ctErr(
        CT_ERRORS.INVALID,
        'Pick the counterparty from its canonical module.',
      );
    return p;
  }

  /** Server preview for the wizard's terms step: the template filled from real records, plus what's still open. */
  async preview(a: CtActor, i: WizardIn) {
    const biz = await this.ctx.business(a.rootId);
    const p = i.cp ? await this.party(a, i.cp).catch(() => null) : null;
    let content = i.body ?? '';
    if (i.templateId && !i.body) {
      const t = await this.templates.get(a, i.templateId);
      content = this.templates.published(t)?.content ?? '';
    }
    const r = this.templates.render(content, {
      business: biz,
      party: p,
      number: null,
      start: day(i.start),
      end: i.end ? day(i.end) : null,
      value: i.value === '' || i.value == null ? null : Number(i.value),
      currency: biz.currency,
      notice: i.notice == null ? null : Number(i.notice),
      tz: biz.timezone,
    });
    return {
      text: r.text,
      open: r.open.filter((x) => x !== 'contract.number'),
      number: await this.ctx.previewContractNumber(a.rootId),
    };
  }

  // ── create / edit ─────────────────────────────────────────────────────

  async create(a: CtActor, i: WizardIn, file: Upload | null) {
    this.ctx.need(a, 'manage', 'Creating contracts');
    const src = ['tpl', 'blank', 'upload'].includes(i.src ?? '')
      ? i.src!
      : 'blank';
    const title = (i.title ?? '').trim().slice(0, 255);
    if (!title) throw ctErr(CT_ERRORS.INVALID, 'Title is required.');
    const type = CT_TYPES.includes(i.type ?? '') ? i.type! : 'Custom';
    const p = await this.party(a, i.cp);
    const start = day(i.start);
    if (!start) throw ctErr(CT_ERRORS.INVALID, 'Start date is required.');
    const end = i.end ? day(i.end) : null;
    const notice = Math.max(0, Math.round(Number(i.notice) || 0));
    if (end && end <= start)
      throw ctErr(CT_ERRORS.INVALID, 'End date must be after the start date.');
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (src !== 'upload' && end && addDays(end, -notice) < today)
      throw ctErr(
        CT_ERRORS.INVALID,
        'Notice deadline would already be in the past.',
      );
    const value = i.value === '' || i.value == null ? null : Number(i.value);
    if (value != null && (!Number.isFinite(value) || value < 0))
      throw ctErr(
        CT_ERRORS.INVALID,
        'Referenced value must be a positive number.',
      );
    const email = (i.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw ctErr(CT_ERRORS.INVALID, 'Signer email looks invalid.');
    const related = await this.refs(a, i.refs);
    const biz = await this.ctx.business(a.rootId);
    const cfg = await this.ctx.config(a.rootId);
    const group = await this.ctx.branches(a.rootId);
    const branchId =
      i.branchId && group.some((g) => g.id === i.branchId)
        ? i.branchId
        : p.businessId && p.businessId !== a.rootId
          ? p.businessId
          : (a.branches?.[0] ?? null);
    let tpl: Awaited<ReturnType<CtTemplatesService['get']>> | null = null;
    if (src === 'tpl') {
      if (!i.templateId) throw ctErr(CT_ERRORS.INVALID, 'Choose a template.');
      tpl = await this.templates.get(a, i.templateId);
      if (!this.templates.published(tpl))
        throw ctErr(
          CT_ERRORS.STATUS,
          `${tpl.number} has no published version yet.`,
        );
    }
    if (src === 'upload' && !file)
      throw ctErr(CT_ERRORS.INVALID, 'Choose the signed contract file.');
    const body =
      src === 'upload'
        ? ''
        : (
            i.body ?? (tpl ? this.templates.published(tpl)!.content : '')
          ).trim();
    if (src !== 'upload') {
      if (!body) throw ctErr(CT_ERRORS.INVALID, 'Add the contract wording.');
      this.templates.checkVars(body);
    }
    const restricted = type === 'Employment Contract';
    const stored =
      src === 'upload' ? await this.files.store(a.rootId, cfg, file!) : null;
    const folder = cfg.folders.list.includes('Contracts')
      ? 'Contracts'
      : (cfg.folders.list[0] ?? 'Contracts');
    const imported = src === 'upload';
    const out = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.contractNumber(a.rootId, tx);
      let s = stored;
      if (!imported) {
        const r = this.templates.render(body, {
          business: biz,
          party: p,
          number,
          start,
          end,
          value,
          currency: biz.currency,
          notice,
          tz: biz.timezone,
        });
        if (r.open.length)
          throw ctErr(
            CT_ERRORS.INVALID,
            `Fill in ${r.open.map((x) => `{{${x}}}`).join(', ')} — ${r.open.length === 1 ? 'it isn’t' : 'they aren’t'} on any Noxtill record, so type the value into the wording.`,
          );
        s = await this.files.storeText(a.rootId, `${number} ${title}`, r.text);
      }
      const docNo = await this.ctx.number(a.rootId, 'doc', tx);
      const doc = await tx.ctDocument.create({
        data: {
          businessId: a.rootId,
          number: docNo,
          title,
          type: [
            'Customer Agreement',
            'Service Agreement',
            'Supplier Agreement',
            'Lease',
            'License',
            'NDA',
          ].includes(type)
            ? type
            : restricted
              ? 'Employment Document'
              : 'Other',
          folder,
          ownerId: a.userId,
          branchId,
          linkModule: p.module,
          linkId: `${p.kind}:${p.id}`,
          status: imported ? 'Signed' : 'Draft',
          sensitivity: restricted ? 'Restricted' : 'Confidential',
          expiresOn: end,
          retention: cfg.contract.retention,
          tags: [],
          shares: [],
          processing: s?.problem ?? null,
          createdById: a.userId,
          versions: {
            create: {
              version: 1,
              storageKey: s!.storageKey,
              fileName: s!.fileName,
              mime: s!.mime,
              size: s!.size,
              sha256: s!.sha256,
              text: s!.text,
              note: imported
                ? 'Imported signed copy'
                : tpl
                  ? `Generated from ${tpl.number} v${this.templates.published(tpl)!.version}`
                  : 'Created',
              state: imported ? 'Signed' : 'Draft',
              immutable: imported,
              byUserId: a.userId,
            },
          },
        },
      });
      const c = await tx.ctContract.create({
        data: {
          businessId: a.rootId,
          number,
          title,
          type,
          cpKind: p.kind,
          cpId: p.id,
          ownerId:
            cfg.contract.ownerId &&
            (await this.ctx.members(a.rootId)).some(
              (m) => m.id === cfg.contract.ownerId,
            )
              ? cfg.contract.ownerId
              : a.userId,
          branchId,
          startOn: start,
          endOn: end,
          noticeDays: notice,
          autoRenew: yes(i.autoRenew),
          value: value == null ? null : new Prisma.Decimal(value),
          currency: biz.currency || 'PKR',
          status: imported ? 'Active' : 'Draft',
          sigState: imported ? 'Completed' : 'Not sent',
          docId: doc.id,
          templateId: tpl?.id ?? null,
          templateVer: tpl ? this.templates.published(tpl)!.version : null,
          restricted,
          signerDraft:
            !imported && (i.signer || email)
              ? {
                  name: (i.signer ?? '').trim(),
                  email,
                  order: i.order === 'Parallel' ? 'Parallel' : 'Sequential',
                  auth: i.auth || 'Email',
                }
              : Prisma.JsonNull,
          related: related,
          createdById: a.userId,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Contract created',
        'contract',
        c.id,
        `${number} · ${title} · ${imported ? 'imported signed copy — signed outside Noxtill, recorded as Active' : `Draft (${tpl ? `template ${tpl.number}` : src})`} · document ${docNo}`,
        { tx },
      );
      return { id: c.id, number, docNumber: docNo, status: c.status };
    });
    return out;
  }

  async edit(
    a: CtActor,
    id: string,
    i: {
      title?: string;
      end?: string | null;
      notice?: number | string;
      value?: number | string | null;
      ownerId?: string;
      expectedVersion?: number;
      force?: boolean;
    },
  ) {
    this.ctx.need(a, 'manage', 'Editing contracts');
    const c = await this.get(a, id);
    if (c.status !== 'Draft')
      throw ctErr(
        CT_ERRORS.STATUS,
        'INVALID_STATUS_TRANSITION — only drafts can be edited; use an amendment.',
      );
    const title = (i.title ?? '').trim();
    if (!title) throw ctErr(CT_ERRORS.INVALID, 'Title required.');
    const members = await this.ctx.members(a.rootId);
    const end = i.end ? day(i.end) : null;
    if (end && end <= c.startOn)
      throw ctErr(CT_ERRORS.INVALID, 'End date must be after the start date.');
    const value = i.value === '' || i.value == null ? null : Number(i.value);
    const data = {
      title: title.slice(0, 255),
      endOn: end,
      noticeDays: Math.max(0, Math.round(Number(i.notice) || 0)),
      value: value == null ? null : new Prisma.Decimal(value),
      ownerId:
        i.ownerId && members.some((m) => m.id === i.ownerId)
          ? i.ownerId
          : c.ownerId,
    };
    if (
      i.expectedVersion != null &&
      i.expectedVersion !== c.version &&
      !i.force
    ) {
      const last = await this.db.ctAudit.findFirst({
        where: { businessId: a.rootId, entityId: c.id },
        orderBy: { createdAt: 'desc' },
      });
      throw ctErr(
        CT_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${last?.actorName ?? 'Someone'} saved v${c.version} while you were editing${last ? ` (${last.detail})` : ''}. Your edits were NOT saved.`,
        HttpStatus.CONFLICT,
      );
    }
    const n = await this.db.ctContract.updateMany({
      where: { id: c.id, version: c.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!n.count)
      throw ctErr(
        CT_ERRORS.CONFLICT,
        'VERSION_CONFLICT — saved by someone else a moment ago. Reload and re-apply.',
        HttpStatus.CONFLICT,
      );
    if (c.docId)
      await this.db.ctDocument.update({
        where: { id: c.docId },
        data: { title: data.title, expiresOn: end },
      });
    const diff = [
      c.title !== data.title && `title “${data.title}”`,
      (c.endOn ? iso(c.endOn) : null) !== (end ? iso(end) : null) &&
        `end ${end ? iso(end) : 'open'}`,
      c.noticeDays !== data.noticeDays && `notice ${data.noticeDays}d`,
      num(c.value) !== (value ?? 0) && `value ${value ?? '—'}`,
      c.ownerId !== data.ownerId &&
        `owner ${members.find((m) => m.id === data.ownerId)?.name}`,
    ].filter(Boolean);
    await this.ctx.audit(
      a.rootId,
      a,
      'Contract edited',
      'contract',
      c.id,
      `${c.number} v${c.version + 1}${diff.length ? ` · ${diff.join(', ')}` : ''}`,
    );
    return {
      version: c.version + 1,
      note: 'The generated document text isn’t rewritten — upload a new version if the wording should change.',
    };
  }

  async submit(a: CtActor, id: string, note: string) {
    this.ctx.need(a, 'manage', 'Submitting contracts for approval');
    const c = await this.get(a, id);
    if (!(CT_T[c.status] ?? []).includes('Approval Required'))
      throw ctErr(
        CT_ERRORS.STATUS,
        `INVALID_STATUS_TRANSITION — ${c.status} can’t be submitted.`,
      );
    const cfg = await this.ctx.config(a.rootId);
    return this.db.$transaction(async (tx) => {
      const apr = await this.approvals.start(
        a,
        {
          kind: 'Contract',
          entityId: c.id,
          type: c.renewalOf ? 'Renewal approval' : 'Contract approval',
          roles: this.approvals.contractRoles(
            cfg,
            c.value == null ? null : num(c.value),
            c.type,
          ),
          ownerId: c.ownerId,
          reason: note,
          changes: `v${c.version}`,
          label: `${c.number} · ${c.title}`,
          link: `/contracts/${c.number}`,
        },
        tx,
      );
      if (apr.status === 'Approved') {
        await this.move(
          a,
          c,
          'Approval Required',
          { aprState: 'Pending' },
          `${apr.number}`,
          tx,
        );
        await this.move(
          a,
          { ...c, status: 'Approval Required' },
          'Approved',
          { aprState: 'Approved' },
          'every step already satisfied',
          tx,
        );
      } else
        await this.move(
          a,
          c,
          'Approval Required',
          { aprState: 'Pending' },
          apr.number,
          tx,
        );
      if (c.docId)
        await tx.ctDocument.update({
          where: { id: c.docId },
          data: {
            status: apr.status === 'Approved' ? 'Approved' : 'Approval Pending',
          },
        });
      return {
        approval: apr.number,
        steps: (apr.steps as unknown as { role: string }[]).length,
        status: apr.status,
      };
    });
  }

  async archive(a: CtActor, id: string, reason: string) {
    this.ctx.need(a, 'manage', 'Archiving contracts');
    const c = await this.get(a, id);
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    await this.move(a, c, 'Archived', {}, reason);
    await this.approvals.cancelFor(a, c.id, 'contract archived');
    return { ok: true };
  }

  async terminate(
    a: CtActor,
    id: string,
    eff: string,
    reason: string,
    typed: string,
  ) {
    this.ctx.need(a, 'terminate', 'Terminating contracts');
    const c = await this.get(a, id);
    if (typed !== 'TERMINATE')
      throw ctErr(CT_ERRORS.INVALID, 'Type TERMINATE to confirm.');
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    const e = day(eff);
    if (!e) throw ctErr(CT_ERRORS.INVALID, 'Effective date required.');
    const earliest = addDays(
      new Date(new Date().toISOString().slice(0, 10)),
      c.noticeDays,
    );
    if (e < earliest)
      throw ctErr(
        CT_ERRORS.INVALID,
        `Effective date is before the ${c.noticeDays}-day notice period (earliest ${iso(earliest)}).`,
      );
    await this.db.$transaction(async (tx) => {
      await this.move(
        a,
        c,
        'Terminated',
        { terminatedOn: e },
        `effective ${iso(e)} · ${reason}`,
        tx,
      );
      await tx.ctObligation.updateMany({
        where: { contractId: c.id, status: { in: ['Upcoming'] } },
        data: { status: 'Cancelled' },
      });
    });
    return { ok: true };
  }

  // ── renewal decisions ─────────────────────────────────────────────────

  async renew(a: CtActor, id: string, endS: string, changes: string) {
    this.ctx.need(a, 'manage', 'Starting renewals');
    const c = await this.get(a, id);
    if (![...LIVE, 'Expired'].includes(c.status))
      throw ctErr(CT_ERRORS.STATUS, `${c.status} contracts can’t be renewed.`);
    const end = day(endS);
    if (!end || (c.endOn && end <= c.endOn))
      throw ctErr(
        CT_ERRORS.INVALID,
        'New end date must be after the current end date.',
      );
    const draft = await this.db.ctContract.findFirst({
      where: {
        businessId: a.rootId,
        renewalOf: c.id,
        status: { notIn: ['Archived'] },
      },
    });
    if (draft)
      throw ctErr(
        CT_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — ${draft.number} is already the renewal of ${c.number}.`,
        HttpStatus.CONFLICT,
      );
    const old = c.docId
      ? await this.db.ctDocVersion.findFirst({
          where: { docId: c.docId },
          orderBy: { version: 'desc' },
        })
      : null;
    const oldDoc = c.docId
      ? await this.db.ctDocument.findUnique({ where: { id: c.docId } })
      : null;
    const start = c.endOn
      ? addDays(c.endOn, 1)
      : new Date(new Date().toISOString().slice(0, 10));
    return this.db.$transaction(async (tx) => {
      const number = await this.ctx.contractNumber(a.rootId, tx);
      const text = `RENEWAL of ${c.number} — ${c.title}\nRenewal term: ${iso(start)} → ${iso(end)}${changes.trim() ? `\nChanges vs current terms: ${changes.trim()}` : '\nNo changes to the current terms.'}\n\n${old?.text ?? '(The original document has no extractable text — see the original file.)'}`;
      const s = await this.files.storeText(a.rootId, `${number} renewal`, text);
      const docNo = await this.ctx.number(a.rootId, 'doc', tx);
      const doc = await tx.ctDocument.create({
        data: {
          businessId: a.rootId,
          number: docNo,
          title: `${c.title} (renewal)`.slice(0, 255),
          type: oldDoc?.type ?? 'Other',
          folder: oldDoc?.folder ?? 'Contracts',
          ownerId: c.ownerId,
          branchId: c.branchId,
          linkModule: oldDoc?.linkModule ?? null,
          linkId: oldDoc?.linkId ?? null,
          status: 'Draft',
          sensitivity: oldDoc?.sensitivity ?? 'Confidential',
          expiresOn: end,
          retention: oldDoc?.retention ?? '7 years after expiry',
          tags: [],
          shares: [],
          createdById: a.userId,
          versions: {
            create: {
              version: 1,
              storageKey: s.storageKey,
              fileName: s.fileName,
              mime: s.mime,
              size: s.size,
              sha256: s.sha256,
              text: s.text,
              note: `Renewal draft of ${c.number}`,
              state: 'Draft',
              byUserId: a.userId,
            },
          },
        },
      });
      const n = await tx.ctContract.create({
        data: {
          businessId: a.rootId,
          number,
          title: `${c.title} (renewal)`.slice(0, 255),
          type: c.type,
          cpKind: c.cpKind,
          cpId: c.cpId,
          ownerId: c.ownerId,
          branchId: c.branchId,
          startOn: start,
          endOn: end,
          noticeDays: c.noticeDays,
          autoRenew: c.autoRenew,
          value: c.value,
          currency: c.currency,
          status: 'Draft',
          docId: doc.id,
          templateId: c.templateId,
          templateVer: c.templateVer,
          restricted: c.restricted,
          renewalOf: c.id,
          signerDraft: c.signerDraft ?? Prisma.JsonNull,
          related: c.related ?? [],
          createdById: a.userId,
        },
      });
      for (const t of c.terms.filter((x) => x.status === 'Confirmed'))
        await tx.ctTerm.create({
          data: {
            contractId: n.id,
            term: t.term,
            value: t.value,
            source: `${t.source} (from ${c.number})`,
            status: 'Confirmed',
          },
        });
      for (const o of c.obls.filter(
        (x) => x.frequency !== 'Once' && !['Cancelled'].includes(x.status),
      )) {
        let due = o.dueOn;
        while (due < start) due = addMonths(due, FREQ[o.frequency] ?? 12);
        await tx.ctObligation.create({
          data: {
            contractId: n.id,
            title: o.title,
            responsible: o.responsible,
            ownerId: o.ownerId,
            dueOn: due,
            frequency: o.frequency,
            status: 'Upcoming',
          },
        });
      }
      if ((CT_T[c.status] ?? []).includes('Renewal Review'))
        await this.move(
          a,
          c,
          'Renewal Review',
          {},
          `renewal draft ${number}`,
          tx,
        );
      await tx.ctContract.update({
        where: { id: c.id },
        data: {
          renewState: 'Renewal Draft',
          renewNote: `Renewal draft ${number}${changes.trim() ? ` · ${changes.trim()}` : ''}`,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Renewal started',
        'contract',
        c.id,
        `${c.number} → ${number} (original preserved) · ${iso(start)} → ${iso(end)}`,
        { tx },
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Contract created',
        'contract',
        n.id,
        `${number} · renewal draft of ${c.number}`,
        { tx },
      );
      return { id: n.id, number };
    });
  }

  /** Records "will not renew"; optionally emails the counterparty a non-renewal notice. */
  async wnr(a: CtActor, id: string, reason: string, notify: boolean) {
    this.ctx.need(a, 'manage', 'Renewal decisions');
    const c = await this.get(a, id);
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    let sent = '';
    if (notify) {
      const p = (await this.ctx.parties(a.rootId)).find(
        (x) => x.kind === c.cpKind && x.id === c.cpId,
      );
      if (!p?.email)
        throw ctErr(
          CT_ERRORS.INVALID,
          `${p?.name ?? 'The counterparty'} has no email on record — record the decision without notifying, then contact them directly.`,
        );
      const biz = await this.ctx.business(a.rootId);
      try {
        await this.email.send({
          to: p.email,
          templateKey: 'contract_non_renewal_notice',
          locale: 'en',
          businessId: a.rootId,
          text: `Dear ${p.name},\n\nThis is notice from ${biz.name} that ${c.title} (${c.number})${c.endOn ? `, ending ${iso(c.endOn)},` : ''} will not be renewed.\n\n${reason.trim()}\n\n— ${a.name}`,
        });
        sent = ` · notice emailed to ${p.email}`;
      } catch (e) {
        throw ctErr(
          'DELIVERY_FAILED',
          `Notice email failed — ${(e as Error).message}. Nothing was recorded; try again or untick “notify”.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
    await this.db.ctContract.update({
      where: { id: c.id },
      data: {
        renewState: 'Will Not Renew',
        renewNote: `Will not renew — ${reason.trim()} (${a.name})`.slice(
          0,
          500,
        ),
        snoozedUntil: null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Marked will not renew',
      'contract',
      c.id,
      `${c.number} · ${reason.trim()}${sent}`,
    );
    return { ok: true, sent: !!sent };
  }

  /** Snooze an expiry item — contracts keep the decision inline, documents/compliance in CtExpiryState. */
  async snooze(
    a: CtActor,
    key: string,
    until: string,
    reason: string,
    ok: boolean,
  ) {
    this.ctx.need(a, 'manage', 'Snoozing expiries');
    const u = day(until);
    if (!u || u <= new Date())
      throw ctErr(CT_ERRORS.INVALID, 'Choose a future date.');
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    const [k, id] = key.split(':');
    let notice: Date | null = null;
    let label = '';
    if (k === 'c') {
      const c = await this.get(a, id);
      notice = c.endOn ? addDays(c.endOn, -c.noticeDays) : null;
      label = c.number;
    } else if (k === 'd') {
      const d = await this.db.ctDocument.findFirst({
        where: { businessId: a.rootId, id },
      });
      if (!d) throw notFound('Document');
      notice = d.expiresOn ? addDays(d.expiresOn, -30) : null;
      label = d.number;
    } else {
      const x = await this.db.ctCompliance.findFirst({
        where: { businessId: a.rootId, id },
      });
      if (!x) throw notFound('Compliance record');
      notice = x.expiresOn ? addDays(x.expiresOn, -30) : null;
      label = x.number;
    }
    if (notice && u > notice && !ok)
      throw ctErr(
        CT_ERRORS.INVALID,
        `Snoozing past the notice deadline (${iso(notice)}) needs explicit confirmation.`,
      );
    const note = `Snoozed until ${iso(u)} by ${a.name}: ${reason.trim()}`.slice(
      0,
      500,
    );
    if (k === 'c')
      await this.db.ctContract.update({
        where: { id },
        data: { renewState: 'Snoozed', snoozedUntil: u, renewNote: note },
      });
    else
      await this.db.ctExpiryState.upsert({
        where: { businessId_key: { businessId: a.rootId, key } },
        create: {
          businessId: a.rootId,
          key,
          state: 'Snoozed',
          snoozedUntil: u,
          note,
        },
        update: { state: 'Snoozed', snoozedUntil: u, note },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      'Expiry snoozed',
      k === 'c' ? 'contract' : k === 'd' ? 'document' : 'compliance',
      id,
      `${label} until ${iso(u)} · ${reason.trim()}`,
    );
    return { ok: true };
  }

  /** Notify the owner, or ask the counterparty for a replacement document. */
  async message(
    a: CtActor,
    kind: 'notify' | 'replace',
    key: string,
    msg: string,
  ) {
    if (!msg.trim()) throw ctErr(CT_ERRORS.INVALID, 'Write the message.');
    const [k, id] = key.split(':');
    const rec =
      k === 'c'
        ? await this.get(a, id)
        : k === 'd'
          ? await this.db.ctDocument.findFirst({
              where: { businessId: a.rootId, id },
            })
          : await this.db.ctCompliance.findFirst({
              where: { businessId: a.rootId, id },
            });
    if (!rec) throw notFound('Record');
    const ownerId = rec.ownerId;
    let to = '';
    if (kind === 'notify') {
      await this.ctx.notify(
        a.rootId,
        [ownerId],
        `Expiry · ${'title' in rec ? rec.title : ''}`,
        msg.trim(),
        k === 'c'
          ? `/contracts/${(rec as { number: string }).number}`
          : '/contracts/expiries',
      );
      to =
        (await this.ctx.members(a.rootId)).find((m) => m.id === ownerId)
          ?.name ?? 'owner';
    } else {
      const link = k === 'd' ? (rec as { linkId: string | null }).linkId : null;
      const [pk, pid] = (link ?? '').split(':');
      const p = (await this.ctx.parties(a.rootId)).find(
        (x) => x.kind === pk && x.id === pid,
      );
      if (p?.email && p.kind !== 'staff') {
        try {
          await this.email.send({
            to: p.email,
            templateKey: 'document_replacement_request',
            locale: 'en',
            businessId: a.rootId,
            text: msg.trim(),
          });
          to = p.email;
        } catch (e) {
          throw ctErr(
            'DELIVERY_FAILED',
            `Email failed — ${(e as Error).message}. Nothing was sent.`,
            HttpStatus.BAD_GATEWAY,
          );
        }
      } else if (p?.kind === 'staff') {
        await this.ctx.notify(
          a.rootId,
          [p.id],
          'Replacement document needed',
          msg.trim(),
          '/contracts/documents',
        );
        to = `${p.name} (in-app)`;
      } else
        throw ctErr(
          CT_ERRORS.INVALID,
          'This record isn’t linked to a counterparty with an email — notify the owner instead.',
        );
      await this.db.ctExpiryState.upsert({
        where: { businessId_key: { businessId: a.rootId, key } },
        create: {
          businessId: a.rootId,
          key,
          state: 'Review Required',
          note: `Replacement requested from ${to}`,
        },
        update: {
          state: 'Review Required',
          note: `Replacement requested from ${to}`,
          snoozedUntil: null,
        },
      });
    }
    await this.ctx.audit(
      a.rootId,
      a,
      kind === 'notify' ? 'Owner notified' : 'Replacement requested',
      k === 'c' ? 'contract' : k === 'd' ? 'document' : 'compliance',
      id,
      `${to} · ${msg.trim().slice(0, 200)}`,
    );
    return { to };
  }

  // ── terms & obligations ───────────────────────────────────────────────

  async term(
    a: CtActor,
    id: string,
    i: { term?: string; value?: string; source?: string },
    termId?: string,
  ) {
    this.ctx.need(a, 'manage', 'Editing contract terms');
    const c = await this.get(a, id);
    const value = (i.value ?? '').trim();
    if (termId) {
      const t = c.terms.find((x) => x.id === termId);
      if (!t) throw notFound('Term');
      if (!value) throw ctErr(CT_ERRORS.INVALID, 'Value required.');
      await this.db.ctTerm.update({
        where: { id: t.id },
        data: {
          value: value.slice(0, 500),
          source: (i.source ?? t.source).slice(0, 120),
          confidence: null,
          status: 'Confirmed',
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Term corrected',
        'contract',
        c.id,
        `${c.number} · ${t.term}: ${t.value} → ${value}`,
      );
      return { ok: true };
    }
    if (!i.term?.trim() || !value || !i.source?.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Term, value and source are required.');
    await this.db.ctTerm.create({
      data: {
        contractId: c.id,
        term: i.term.trim().slice(0, 120),
        value: value.slice(0, 500),
        source: i.source.trim().slice(0, 120),
        status: 'Confirmed',
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Term added',
      'contract',
      c.id,
      `${c.number} · ${i.term.trim()} = ${value} [${i.source.trim()}]`,
    );
    return { ok: true };
  }

  async obligation(
    a: CtActor,
    id: string,
    i: {
      title?: string;
      responsible?: string;
      ownerId?: string;
      due?: string;
      frequency?: string;
    },
  ) {
    this.ctx.need(a, 'manage', 'Adding obligations');
    const c = await this.get(a, id);
    const due = day(i.due);
    if (!i.title?.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Obligation required.');
    if (!due) throw ctErr(CT_ERRORS.INVALID, 'Due date required.');
    const members = await this.ctx.members(a.rootId);
    const o = await this.db.ctObligation.create({
      data: {
        contractId: c.id,
        title: i.title.trim().slice(0, 255),
        responsible: ['Business', 'Counterparty', 'Both'].includes(
          i.responsible ?? '',
        )
          ? i.responsible!
          : 'Business',
        ownerId:
          i.ownerId && members.some((m) => m.id === i.ownerId)
            ? i.ownerId
            : c.ownerId,
        dueOn: due,
        frequency: ['Once', 'Monthly', 'Quarterly', 'Annual'].includes(
          i.frequency ?? '',
        )
          ? i.frequency!
          : 'Once',
        status: 'Upcoming',
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Obligation added',
      'contract',
      c.id,
      `${c.number} · ${o.title} · due ${iso(due)} · ${o.frequency}`,
    );
    return { id: o.id };
  }

  /** Completing a recurring obligation schedules its next occurrence (within the contract term). */
  async oblDone(
    a: CtActor,
    id: string,
    oblId: string,
    evidenceDocId: string | null,
    note: string,
    waive = false,
  ) {
    this.ctx.need(a, 'manage', 'Updating obligations');
    const c = await this.get(a, id);
    const o = c.obls.find((x) => x.id === oblId);
    if (!o) throw notFound('Obligation');
    if (['Completed', 'Waived', 'Cancelled'].includes(o.status))
      throw ctErr(CT_ERRORS.STATUS, `Already ${o.status.toLowerCase()}.`);
    if (waive && !note.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    if (
      evidenceDocId &&
      !(await this.db.ctDocument.findFirst({
        where: { businessId: a.rootId, id: evidenceDocId },
      }))
    )
      throw notFound('Evidence document');
    let next = '';
    await this.db.$transaction(async (tx) => {
      await tx.ctObligation.update({
        where: { id: o.id },
        data: {
          status: waive ? 'Waived' : 'Completed',
          evidenceDocId: evidenceDocId || o.evidenceDocId,
          note: note.trim().slice(0, 255) || null,
        },
      });
      const m = FREQ[o.frequency];
      if (m && !waive) {
        const due = addMonths(o.dueOn, m);
        if (!c.endOn || due <= c.endOn) {
          await tx.ctObligation.create({
            data: {
              contractId: c.id,
              title: o.title,
              responsible: o.responsible,
              ownerId: o.ownerId,
              dueOn: due,
              frequency: o.frequency,
              status: 'Upcoming',
            },
          });
          next = ` · next due ${iso(due)}`;
        }
      }
    });
    await this.ctx.audit(
      a.rootId,
      a,
      waive ? 'Obligation waived' : 'Obligation completed',
      'contract',
      c.id,
      `${c.number} · ${o.title}${evidenceDocId ? ` · evidence ${evidenceDocId}` : ''}${note ? ` · ${note}` : ''}${next}`,
    );
    return { ok: true, next };
  }

  /** A real task in Projects & Tasks (needs a project in the current business to hold it). */
  async task(
    a: CtActor,
    i: {
      projectId?: string;
      title?: string;
      assigneeId?: string;
      due?: string;
      ref?: string;
      obligationId?: string;
      contractId?: string;
    },
  ) {
    const members = await this.ctx.members(a.rootId);
    const m = members.find((x) => x.id === i.assigneeId);
    const bu = m
      ? await this.db.businessUser.findFirst({
          where: { userId: m.id, businessId: a.user.businessId },
          select: { id: true },
        })
      : null;
    if (m && !bu)
      throw ctErr(
        CT_ERRORS.INVALID,
        `${m.name} isn’t on this branch’s staff — assign someone here or switch branch.`,
      );
    const t = await this.tasks.create(a.user, {
      projectId: i.projectId,
      title: (i.title ?? '').slice(0, 255),
      assigneeId: bu?.id ?? null,
      dueDate: i.due || null,
      description: `From Contracts · ${i.ref ?? ''}`,
    });
    if (i.obligationId && i.contractId) {
      const c = await this.get(a, i.contractId);
      if (c.obls.some((o) => o.id === i.obligationId))
        await this.db.ctObligation.update({
          where: { id: i.obligationId },
          data: { taskId: t.number },
        });
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Task created',
      i.contractId ? 'contract' : 'expiry',
      i.contractId ?? a.rootId,
      `${t.number} · ${i.title} · ${i.ref ?? ''}`,
    );
    return { number: t.number };
  }

  // ── amendments ────────────────────────────────────────────────────────

  async amend(
    a: CtActor,
    id: string,
    i: { reason?: string; eff?: string; sections?: string },
  ) {
    this.ctx.need(a, 'manage', 'Creating amendments');
    const c = await this.get(a, id);
    if (!LIVE.includes(c.status))
      throw ctErr(CT_ERRORS.STATUS, 'Only live contracts can be amended.');
    const reason = (i.reason ?? '').trim();
    if (!reason) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    const eff = day(i.eff);
    if (!eff) throw ctErr(CT_ERRORS.INVALID, 'Effective date required.');
    const secs = (i.sections ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const oldDoc = c.docId
      ? await this.db.ctDocument.findUnique({ where: { id: c.docId } })
      : null;
    return this.db.$transaction(async (tx) => {
      const number = `AMD-${c.amends.length + 1}`;
      const s = await this.files.storeText(
        a.rootId,
        `${c.number} ${number}`,
        `AMENDMENT ${number} to ${c.number} — ${c.title}\nEffective: ${iso(eff)}\nChanged sections: ${secs.join(', ') || '—'}\n\nReason / change:\n${reason}\n\nAll other terms of ${c.number} remain unchanged. The signed original is not modified.`,
      );
      const docNo = await this.ctx.number(a.rootId, 'doc', tx);
      const doc = await tx.ctDocument.create({
        data: {
          businessId: a.rootId,
          number: docNo,
          title: `${c.title} — ${number}`.slice(0, 255),
          type: oldDoc?.type ?? 'Other',
          folder: oldDoc?.folder ?? 'Contracts',
          ownerId: c.ownerId,
          branchId: c.branchId,
          linkModule: oldDoc?.linkModule ?? null,
          linkId: oldDoc?.linkId ?? null,
          status: 'Draft',
          sensitivity: oldDoc?.sensitivity ?? 'Confidential',
          retention: oldDoc?.retention ?? '7 years after expiry',
          tags: ['amendment'],
          shares: [],
          createdById: a.userId,
          versions: {
            create: {
              version: 1,
              storageKey: s.storageKey,
              fileName: s.fileName,
              mime: s.mime,
              size: s.size,
              sha256: s.sha256,
              text: s.text,
              note: `${number} of ${c.number}`,
              state: 'Draft',
              byUserId: a.userId,
            },
          },
        },
      });
      const m = await tx.ctAmendment.create({
        data: {
          contractId: c.id,
          number,
          reason: reason.slice(0, 500),
          effectiveOn: eff,
          sections: secs,
          status: 'Draft',
          docId: doc.id,
          byUserId: a.userId,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Amendment created',
        'contract',
        c.id,
        `${c.number} · ${number} · signed original unchanged · ${reason}`,
        { tx },
      );
      return { id: m.id, number, docNumber: docNo };
    });
  }

  async submitAmend(a: CtActor, id: string, amendId: string, note: string) {
    this.ctx.need(a, 'manage', 'Submitting amendments');
    const c = await this.get(a, id);
    const m = c.amends.find((x) => x.id === amendId || x.number === amendId);
    if (!m) throw notFound('Amendment');
    if (m.status !== 'Draft')
      throw ctErr(CT_ERRORS.STATUS, `${m.number} is ${m.status}.`);
    const cfg = await this.ctx.config(a.rootId);
    const apr = await this.approvals.start(a, {
      kind: 'Amendment',
      entityId: m.id,
      type: 'Amendment approval',
      roles: this.approvals.contractRoles(
        cfg,
        c.value == null ? null : num(c.value),
        c.type,
      ),
      ownerId: c.ownerId,
      reason: note || m.reason,
      changes: `${m.number} · ${(m.sections as string[]).join(', ') || '—'}`,
      label: `${c.number} · ${m.number}`,
      link: `/contracts/${c.number}`,
    });
    await this.db.ctAmendment.update({
      where: { id: m.id },
      data:
        apr.status === 'Approved'
          ? { status: 'Approved', aprState: 'Approved' }
          : { status: 'Approval Required', aprState: 'Pending' },
    });
    return { approval: apr.number };
  }

  // ── bulk ──────────────────────────────────────────────────────────────

  async bulkOwner(a: CtActor, ids: string[], ownerId: string) {
    this.ctx.need(a, 'manage', 'Assigning owners');
    const members = await this.ctx.members(a.rootId);
    const m = members.find((x) => x.id === ownerId);
    if (!m) throw ctErr(CT_ERRORS.INVALID, 'Choose the new owner.');
    const cs = await Promise.all(ids.map((x) => this.get(a, x)));
    await this.db.ctContract.updateMany({
      where: { id: { in: cs.map((c) => c.id) } },
      data: { ownerId },
    });
    for (const c of cs)
      await this.ctx.audit(
        a.rootId,
        a,
        'Owner assigned',
        'contract',
        c.id,
        `${c.number} → ${m.name}`,
      );
    await this.ctx.notify(
      a.rootId,
      [ownerId],
      'Contracts assigned to you',
      cs.map((c) => c.number).join(', '),
      '/contracts/all',
      a.userId,
    );
    return { n: cs.length };
  }

  async bulkReview(a: CtActor, ids: string[], note: string) {
    this.ctx.need(a, 'manage', 'Requesting reviews');
    const cs = await Promise.all(ids.map((x) => this.get(a, x)));
    const by = new Map<string, string[]>();
    for (const c of cs)
      by.set(c.ownerId, [...(by.get(c.ownerId) ?? []), c.number]);
    for (const [u, list] of by)
      await this.ctx.notify(
        a.rootId,
        [u],
        'Contract review requested',
        `${a.name}: please review ${list.join(', ')}${note ? ` — ${note}` : ''}`,
        '/contracts/all',
      );
    for (const c of cs)
      await this.ctx.audit(
        a.rootId,
        a,
        'Review requested',
        'contract',
        c.id,
        `${c.number}${note ? ` · ${note}` : ''} · no status change`,
      );
    return { n: cs.length };
  }
}
