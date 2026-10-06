import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { S3Service } from '../common/storage/s3.service';
import {
  FsActor,
  FsContextService,
  fsErr,
  notFound,
} from './fs-context.service';
import { FsNotifyService } from './fs-notify.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { DONE, FS_ERRORS } from './fs.constants';
import { dayKey } from './fs-time';

export interface AgreementIn {
  customerId: string;
  contractId?: string | null;
  startOn: string;
  endOn: string;
  assetIds: string[];
  serviceTypeIds: string[];
  visits: number;
  freq: string;
  respH: number;
  resH: number;
  labor: string;
  parts: string;
  renewal: string;
}

type Upload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/**
 * Service agreements (operational entitlements — legal text and signatures stay in Contracts) and
 * warranty cases (eligibility is checked against the Assets & Maintenance record; a person decides).
 */
@Injectable()
export class FsCasesService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly wos: FsWorkOrdersService,
    private readonly notify: FsNotifyService,
    private readonly s3: S3Service,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  // ── agreements ──────────────────────────────────────────────────────────

  async saveAgreement(a: FsActor, id: string | null, b: AgreementIn) {
    this.ctx.need(a, 'agreement', 'Managing service agreements');
    const d = await this.wos.load(a);
    const cus = await this.db.customer.findFirst({
      where: { id: b.customerId, businessId: { in: d.group.map((g) => g.id) } },
    });
    if (!cus) throw fsErr(FS_ERRORS.INVALID, 'Pick a customer.');
    const s = new Date(`${b.startOn}T00:00:00Z`);
    const e = new Date(`${b.endOn}T00:00:00Z`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s)
      throw fsErr(FS_ERRORS.INVALID, 'End date must be after the start date.');
    if (!(b.visits >= 1))
      throw fsErr(FS_ERRORS.INVALID, 'Included visits must be at least 1.');
    if (!(b.respH > 0) || !(b.resH >= b.respH))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Response SLA must be positive and the resolution SLA at least as long.',
      );
    const svcs = b.serviceTypeIds.filter((x) => d.svc.has(x));
    if (!svcs.length)
      throw fsErr(FS_ERRORS.INVALID, 'Pick at least one covered service type.');
    const assets = b.assetIds.filter(
      (x) => d.assets.get(x)?.customerId === b.customerId,
    );
    if (b.contractId) {
      const ct = await this.db.ctContract.findFirst({
        where: { id: b.contractId, businessId: a.rootId },
      });
      if (!ct)
        throw fsErr(FS_ERRORS.INVALID, 'That contract no longer exists.');
      if (ct.cpKind !== 'customer' || ct.cpId !== b.customerId)
        throw fsErr(
          FS_ERRORS.INVALID,
          `${ct.number} is with a different counterparty — link a contract with this customer.`,
        );
      if (['Archived', 'Terminated'].includes(ct.status))
        throw fsErr(
          FS_ERRORS.INVALID,
          `${ct.number} is ${ct.status.toLowerCase()} — it can’t back an active agreement.`,
        );
    }
    const data = {
      customerId: b.customerId,
      contractId: b.contractId || null,
      startOn: s,
      endOn: e,
      assetIds: assets,
      serviceTypeIds: svcs,
      visits: Math.round(b.visits),
      freq: b.freq.slice(0, 40),
      respH: Math.round(b.respH),
      resH: Math.round(b.resH),
      labor: b.labor.slice(0, 60),
      parts: b.parts.slice(0, 60),
      renewal: b.renewal === 'Auto-renew' ? 'Auto-renew' : 'Manual',
    };
    if (id) {
      const g = d.agreements.find((x) => x.id === id);
      if (!g) throw notFound('Agreement');
      await this.db.fsAgreement.update({ where: { id }, data });
      await this.ctx.audit(
        a.rootId,
        a,
        'Agreement updated',
        'agreement',
        id,
        g.number,
      );
      return { ok: true, msg: `${g.number} saved.` };
    }
    const number = await this.ctx.number(a.rootId, 'agr');
    const g = await this.db.fsAgreement.create({
      data: { ...data, businessId: a.rootId, number, status: 'Active' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Service agreement created',
      'agreement',
      g.id,
      `${number} · ${cus.name}${b.contractId ? ` ← contract ${b.contractId}` : ''}`,
    );
    return { ok: true, id: g.id, msg: `${number} created.` };
  }

  async agreementStatus(
    a: FsActor,
    id: string,
    suspend: boolean,
    reason: string,
  ) {
    this.ctx.need(a, 'agreement', 'Changing agreements');
    if (!reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    const g = await this.db.fsAgreement.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!g) throw notFound('Agreement');
    await this.db.fsAgreement.update({
      where: { id },
      data: { status: suspend ? 'Suspended' : 'Active' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Agreement ${suspend ? 'suspended' : 'resumed'}`,
      'agreement',
      id,
      `${g.number} · ${reason}`,
    );
    return {
      ok: true,
      msg: `${g.number} ${suspend ? 'suspended' : 'resumed'}.`,
    };
  }

  // ── warranty ────────────────────────────────────────────────────────────

  private hist(x: { history: Prisma.JsonValue }, line: string) {
    const h = Array.isArray(x.history) ? (x.history as string[]) : [];
    return [
      ...h,
      `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${line}`,
    ];
  }

  async openCase(
    a: FsActor,
    b: { customerId: string; assetId: string; issue: string; source?: string },
  ) {
    if (!a.agreement && !a.request)
      this.ctx.need(a, 'agreement', 'Opening warranty cases');
    const d = await this.wos.load(a);
    const x =
      d.assets.get(b.assetId) ??
      (await this.db.amAsset.findFirst({
        where: { id: b.assetId, businessId: a.rootId },
      }));
    if (!x)
      throw fsErr(
        FS_ERRORS.INVALID,
        'Pick the asset from Assets & Maintenance.',
      );
    if (x.customerId && x.customerId !== b.customerId)
      throw fsErr(FS_ERRORS.INVALID, 'That asset belongs to another customer.');
    if (!b.issue?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Describe the issue.');
    const open = d.warranty.find(
      (w) =>
        w.assetId === b.assetId &&
        !['Closed', 'Rejected', 'Completed'].includes(w.status),
    );
    if (open)
      throw fsErr(
        FS_ERRORS.DUPLICATE,
        `${open.number} is already open for this asset.`,
        HttpStatus.CONFLICT,
      );
    const src =
      b.source?.trim() ||
      [x.warrantyProvider, x.warrantyType].filter(Boolean).join(' · ') ||
      'Not on the asset record';
    const number = await this.ctx.number(a.rootId, 'wrn');
    const w = await this.db.fsWarranty.create({
      data: {
        businessId: a.rootId,
        number,
        customerId: b.customerId,
        assetId: b.assetId,
        issue: b.issue.trim().slice(0, 2000),
        source: src.slice(0, 80),
        eligibility: 'Pending Validation',
        status: 'Validating',
        evidence: [],
        history: [
          `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · Opened by ${a.name}`,
        ],
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Warranty case opened',
      'warranty',
      w.id,
      `${number} · ${x.name}`,
    );
    return {
      ok: true,
      id: w.id,
      number,
      msg: `${number} opened — validate it against the asset record.`,
    };
  }

  private async mustCase(a: FsActor, id: string) {
    const x = await this.db.fsWarranty.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!x) throw notFound('Warranty case');
    return x;
  }

  /** Eligibility from the asset record: period, serial, evidence and prior repairs (fs-ui.js wrnAction Validate). */
  async validate(a: FsActor, id: string) {
    this.ctx.need(a, 'agreement', 'Validating warranty');
    const x = await this.mustCase(a, id);
    const d = await this.wos.load(a);
    const as = d.assets.get(x.assetId);
    const today = dayKey(d.now, d.tz);
    const inW =
      !!as?.warrantyEnd && as.warrantyEnd.toISOString().slice(0, 10) >= today;
    const ev = Array.isArray(x.evidence) ? (x.evidence as string[]) : [];
    const win = d.cfg.warranty.repeatWindowDays * 86400000;
    const repeat = d.wos.find(
      (w) =>
        w.assetId === x.assetId &&
        DONE.includes(w.status) &&
        w.completedAt &&
        d.now.getTime() - w.completedAt.getTime() <= win,
    );
    let r: [string, string, string];
    if (repeat && /workmanship/i.test(x.source))
      r = [
        'Approval Required',
        'Approval Required',
        `Repeat repair within ${d.cfg.warranty.repeatWindowDays} days of ${repeat.number} — free re-visit needs manager approval`,
      ];
    else if (!inW)
      r = [
        'Not Eligible',
        'Rejected',
        as?.warrantyEnd
          ? `Warranty period ended ${as.warrantyEnd.toISOString().slice(0, 10)}`
          : 'No warranty end date on the asset record',
      ];
    else if (!as?.serial || !ev.length)
      r = [
        'Pending Validation',
        'Validating',
        `${!as?.serial ? 'Serial not recorded in Assets' : 'No evidence attached'} — request evidence (${d.cfg.warranty.evidence})`,
      ];
    else
      r = ['Eligible', x.woId ? 'WO Created' : 'Eligible', 'All checks passed'];
    if (r[0] === 'Approval Required' && !d.cfg.approvals.warrantyException)
      r = [
        'Eligible',
        x.woId ? 'WO Created' : 'Eligible',
        `${r[2]} (approval policy off)`,
      ];
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: {
        eligibility: r[0],
        status: r[1],
        note: r[1] === 'Rejected' ? r[2] : x.note,
        history: this.hist(x, `Validated by ${a.name}: ${r[2]}`),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Warranty validated',
      'warranty',
      x.id,
      `${x.number} → ${r[0]} · event field.warranty.validated`,
    );
    return { ok: true, msg: `${x.number}: ${r[0]} — ${r[2]}.` };
  }

  async requestEvidence(a: FsActor, id: string) {
    this.ctx.need(a, 'agreement', 'Requesting evidence');
    const x = await this.mustCase(a, id);
    const d = await this.wos.load(a);
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'manual',
      customerId: x.customerId,
      templateKey: 'field_update',
      variables: {
        ref: x.number,
        businessName: d.biz.name,
        body: `to check your warranty claim please send: ${d.cfg.warranty.evidence}.`,
      },
    });
    if (!n.sent) throw fsErr(FS_ERRORS.INVALID, `Not sent — ${n.why}.`);
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: {
        history: this.hist(
          x,
          `Evidence requested from customer (${d.cfg.warranty.evidence})`,
        ),
      },
    });
    return {
      ok: true,
      msg: `Customer asked for ${d.cfg.warranty.evidence} (${n.why}).`,
    };
  }

  async addEvidence(a: FsActor, id: string, file: Upload) {
    if (!a.agreement && !a.execute)
      this.ctx.need(a, 'agreement', 'Adding evidence');
    const x = await this.mustCase(a, id);
    if (!file?.buffer?.length) throw fsErr(FS_ERRORS.INVALID, 'Choose a file.');
    if (file.size > 15 * 1024 * 1024)
      throw fsErr(FS_ERRORS.INVALID, 'Files are limited to 15 MB.');
    const name = (file.originalname || 'evidence').slice(0, 200);
    const ext = name.includes('.')
      ? `.${name.split('.').pop()!.toLowerCase().slice(0, 10)}`
      : '';
    const key = `field-service/${a.rootId}/warranty/${x.id}/${randomUUID()}${ext}`;
    await this.s3.upload(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    await this.db.fsFile.create({
      data: {
        businessId: a.rootId,
        warrantyId: x.id,
        stage: 'evidence',
        name,
        storageKey: key,
        mime: (file.mimetype || 'application/octet-stream').slice(0, 120),
        size: file.size,
        byUserId: a.userId,
      },
    });
    const ev = Array.isArray(x.evidence) ? (x.evidence as string[]) : [];
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: {
        evidence: [...ev, name],
        history: this.hist(x, `Evidence attached: ${name}`),
      },
    });
    return { ok: true, msg: 'Evidence attached — validate the case again.' };
  }

  async approve(a: FsActor, id: string, reason: string) {
    this.ctx.need(a, 'approve', 'Approving warranty exceptions');
    if (!reason?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Approval reason required.');
    const x = await this.mustCase(a, id);
    if (x.status !== 'Approval Required')
      throw fsErr(FS_ERRORS.INVALID, `${x.number} isn’t waiting for approval.`);
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: {
        eligibility: 'Eligible',
        status: x.woId ? 'WO Created' : 'Eligible',
        history: this.hist(x, `Approved by ${a.name}: ${reason}`),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Warranty approved',
      'warranty',
      x.id,
      `${x.number} · ${reason} · event field.warranty.approved`,
    );
    return { ok: true, msg: `${x.number} approved.` };
  }

  async reject(
    a: FsActor,
    id: string,
    b: {
      reason: string;
      ev: string;
      cust: string;
      int?: string;
      follow?: string;
    },
  ) {
    if (!a.approve && !a.agreement)
      this.ctx.need(a, 'agreement', 'Rejecting warranty');
    if (!b.cust?.trim() || !b.ev?.trim())
      throw fsErr(
        FS_ERRORS.INVALID,
        'Evidence and customer explanation are required.',
      );
    const x = await this.mustCase(a, id);
    if (['Closed', 'Completed', 'Rejected'].includes(x.status))
      throw fsErr(FS_ERRORS.INVALID, `${x.number} is ${x.status}.`);
    const d = await this.wos.load(a);
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'manual',
      customerId: x.customerId,
      templateKey: 'field_update',
      variables: {
        ref: x.number,
        businessName: d.biz.name,
        body: b.cust.trim(),
      },
    });
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: {
        status: 'Rejected',
        eligibility: 'Not Eligible',
        note: `${b.reason}${b.int ? ` — ${b.int}` : ''}`,
        history: this.hist(
          x,
          `Rejected by ${a.name}: ${b.reason} · evidence: ${b.ev} · customer: ${n.why}`,
        ),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Warranty rejected',
      'warranty',
      x.id,
      `${x.number} · ${b.reason} · event field.warranty.rejected`,
    );
    let extra = '';
    if (b.follow === 'quote') {
      const as = d.assets.get(x.assetId);
      const sv =
        d.svcList.find(
          (s) =>
            s.active &&
            as &&
            d.catNames.get(as.categoryId ?? '') &&
            s.skill === d.catNames.get(as.categoryId ?? ''),
        ) ?? d.svcList.find((s) => s.active);
      if (sv) {
        const w = await this.wos.create(
          { ...a, workorder: true },
          {
            customerId: x.customerId,
            assetId: x.assetId,
            serviceTypeId: sv.id,
            scope: `Chargeable repair · ${x.issue} (warranty ${x.number} rejected)`,
            priority: 'Normal',
          },
        );
        const q = await this.wos
          .quote({ ...a, workorder: true }, w.id)
          .catch((e: Error) => ({ msg: e.message }));
        extra = ` ${w.number} opened for the chargeable repair · ${q.msg}`;
      } else extra = ' No active service type to quote with.';
    }
    return { ok: true, msg: `${x.number} rejected (${n.why}).${extra}` };
  }

  async closeCase(a: FsActor, id: string) {
    this.ctx.need(a, 'agreement', 'Closing warranty cases');
    const x = await this.mustCase(a, id);
    if (!['Completed', 'Rejected'].includes(x.status))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Only completed or rejected cases can be closed.',
      );
    await this.db.fsWarranty.update({
      where: { id: x.id },
      data: { status: 'Closed', history: this.hist(x, `Closed by ${a.name}`) },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Warranty case closed',
      'warranty',
      x.id,
      x.number,
    );
    return { ok: true, msg: `${x.number} closed.` };
  }
}
