import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { S3Service } from '../common/storage/s3.service';
import { HelpdeskTicketsService } from '../helpdesk/helpdesk-tickets.service';
import { HelpdeskContextService } from '../helpdesk/helpdesk-context.service';
import {
  FsActor,
  FsContextService,
  fsErr,
  notFound,
} from './fs-context.service';
import { FsDataService } from './fs-data.service';
import { FsNotifyService } from './fs-notify.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FsCasesService } from './fs-cases.service';
import { CHANNELS, FS_ERRORS, REQ_FINAL, TRIAGE_RESULTS } from './fs.constants';

export interface RequestIn {
  customerId: string;
  siteId?: string | null;
  newSite?: {
    label?: string;
    address: string;
    zone: string;
    access?: string;
    safety?: string;
  } | null;
  assetId?: string | null;
  serviceTypeId?: string | null;
  issue: string;
  priority: string;
  window?: string;
  channel: string;
  sourceRef?: string;
  safety?: string;
  dupOk?: boolean;
}

type Upload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/**
 * Service requests — captured from any channel, triaged by a person, then converted into a work
 * order (the request stays linked). Conversations stay in Unified Inbox / Helpdesk; a request keeps
 * only the source reference.
 */
@Injectable()
export class FsRequestsService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly wos: FsWorkOrdersService,
    private readonly notify: FsNotifyService,
    private readonly s3: S3Service,
    private readonly hdTickets: HelpdeskTicketsService,
    private readonly hdCtx: HelpdeskContextService,
    private readonly cases: FsCasesService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  /** A site picked from the list, or a new one created for this customer. */
  async siteFor(
    a: FsActor,
    customerId: string,
    siteId?: string | null,
    newSite?: RequestIn['newSite'],
  ) {
    if (siteId) {
      const s = await this.db.fsSite.findFirst({
        where: { id: siteId, businessId: a.rootId },
      });
      if (!s) throw notFound('Site');
      if (s.customerId !== customerId)
        throw fsErr(
          FS_ERRORS.INVALID,
          'That site belongs to another customer.',
        );
      return s.id;
    }
    if (newSite?.address?.trim()) {
      const cfg = await this.ctx.config(a.rootId);
      if (!newSite.zone || !cfg.territories.includes(newSite.zone))
        throw fsErr(
          FS_ERRORS.INVALID,
          'Pick the site’s territory (Settings › Territories).',
        );
      const s = await this.db.fsSite.create({
        data: {
          businessId: a.rootId,
          customerId,
          label: (newSite.label || newSite.address).trim().slice(0, 120),
          address: newSite.address.trim().slice(0, 255),
          zone: newSite.zone,
          access: newSite.access?.trim() || null,
          safety: newSite.safety?.trim() || null,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Customer site added',
        'site',
        s.id,
        `${s.label} · ${s.zone}`,
      );
      return s.id;
    }
    return null;
  }

  async create(a: FsActor, b: RequestIn, files: Upload[] = []) {
    this.ctx.need(a, 'request', 'Creating service requests');
    const d = await this.wos.load(a);
    const cus = await this.db.customer.findFirst({
      where: { id: b.customerId, businessId: { in: d.group.map((g) => g.id) } },
    });
    if (!cus)
      throw fsErr(FS_ERRORS.INVALID, 'VALIDATION_ERROR — pick a customer.');
    if (!b.issue?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Describe the problem.');
    if (!d.cfg.priorities.includes(b.priority))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a priority.');
    if (!CHANNELS.includes(b.channel))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a source channel.');
    if (b.serviceTypeId && !d.svc.get(b.serviceTypeId)?.active)
      throw fsErr(FS_ERRORS.INVALID, 'Pick an active service type.');
    if (b.assetId) {
      const x = d.assets.get(b.assetId);
      if (!x)
        throw fsErr(
          FS_ERRORS.INVALID,
          'Asset not found in Assets & Maintenance.',
        );
      if (x.customerId && x.customerId !== b.customerId)
        throw fsErr(
          FS_ERRORS.INVALID,
          'That asset belongs to another customer.',
        );
    }
    const dup = b.assetId
      ? d.requests.find(
          (r) =>
            r.customerId === b.customerId &&
            r.assetId === b.assetId &&
            !REQ_FINAL.includes(r.status),
        )
      : undefined;
    if (dup && !b.dupOk) return { dup: dup.number };
    const siteId =
      (await this.siteFor(a, b.customerId, b.siteId, b.newSite)) ??
      (b.assetId ? (d.eqSite.get(b.assetId) ?? null) : null) ??
      d.siteList.find((s) => s.customerId === b.customerId && s.active)?.id ??
      null;
    const number = await this.ctx.number(a.rootId, 'sr');
    const r = await this.db.fsRequest.create({
      data: {
        businessId: a.rootId,
        number,
        customerId: b.customerId,
        siteId,
        assetId: b.assetId || null,
        issue: b.issue.trim().slice(0, 4000),
        serviceTypeId: b.serviceTypeId || null,
        channel: b.channel,
        sourceRef: b.sourceRef?.trim().slice(0, 80) || 'Manual entry',
        priority: b.priority,
        window: b.window?.trim().slice(0, 80) || null,
        status: 'New',
        ownerId: a.userId,
        notes: b.safety?.trim() ? [`Access / safety: ${b.safety.trim()}`] : [],
        createdById: a.userId,
      },
    });
    for (const f of files.slice(0, 6)) {
      if (!f?.buffer?.length || f.size > 15 * 1024 * 1024) continue;
      const name = (f.originalname || 'photo').slice(0, 200);
      const ext = name.includes('.')
        ? `.${name.split('.').pop()!.toLowerCase().slice(0, 10)}`
        : '';
      const key = `field-service/${a.rootId}/requests/${r.id}/${randomUUID()}${ext}`;
      await this.s3.upload(
        key,
        f.buffer,
        f.mimetype || 'application/octet-stream',
      );
      await this.db.fsFile.create({
        data: {
          businessId: a.rootId,
          requestId: r.id,
          stage: 'attachment',
          name,
          storageKey: key,
          mime: (f.mimetype || 'application/octet-stream').slice(0, 120),
          size: f.size,
          byUserId: a.userId,
        },
      });
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Service request created',
      'request',
      r.id,
      `${number} · ${cus.name}${dup ? ` · duplicate warning overridden (${dup.number})` : ''} · event field.request.created`,
    );
    return { id: r.id, number };
  }

  private async must(a: FsActor, id: string) {
    const r = await this.db.fsRequest.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!r) throw notFound('Request');
    return r;
  }

  async triage(
    a: FsActor,
    id: string,
    b: {
      result: string;
      priority?: string;
      serviceTypeId?: string;
      note?: string;
    },
  ) {
    this.ctx.need(a, 'request', 'Triaging requests');
    const r = await this.must(a, id);
    if (REQ_FINAL.includes(r.status))
      throw fsErr(FS_ERRORS.INVALID, `${r.number} is ${r.status}.`);
    if (!TRIAGE_RESULTS.includes(b.result))
      throw fsErr(FS_ERRORS.INVALID, 'Choose a triage result.');
    if (b.result === 'Reject') return { next: 'reject' };
    if (b.result === 'Send to Helpdesk')
      return this.toHelpdesk(a, r.id, b.note);
    const map: Record<string, string> = {
      'Valid Service Request': 'Ready for Work Order',
      'Covered by Warranty': 'Ready for Work Order',
      'Covered by Agreement': 'Ready for Work Order',
      'Chargeable Service': 'Ready for Work Order',
      'Create Work Order': 'Ready for Work Order',
      'Need More Information': 'Need More Information',
      Duplicate: 'Duplicate',
      'Remote Resolution Possible': 'Rejected',
    };
    const notes = Array.isArray(r.notes) ? (r.notes as string[]) : [];
    await this.db.fsRequest.update({
      where: { id: r.id },
      data: {
        priority: b.priority || r.priority,
        serviceTypeId: b.serviceTypeId || r.serviceTypeId,
        status: map[b.result] ?? r.status,
        ownerId: r.ownerId ?? a.userId,
        triageResult: b.result,
        triagedAt: new Date(),
        outcome:
          b.result === 'Remote Resolution Possible'
            ? 'Remote resolution'
            : r.outcome,
        notes: b.note?.trim() ? [...notes, b.note.trim()] : notes,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Request triaged',
      'request',
      r.id,
      `${r.number} → ${b.result} · event field.request.triaged`,
    );
    let extra = '';
    if (b.result === 'Covered by Warranty' && r.assetId) {
      const open = await this.db.fsWarranty.findFirst({
        where: {
          businessId: a.rootId,
          assetId: r.assetId,
          status: { notIn: ['Closed', 'Rejected', 'Completed'] },
        },
      });
      if (open) extra = ` Warranty case ${open.number} is already open.`;
      else {
        const c = await this.cases.openCase(
          { ...a, agreement: true },
          { customerId: r.customerId, assetId: r.assetId, issue: r.issue },
        );
        extra = ` Warranty case ${c.number} opened — validate it before work starts.`;
      }
    }
    return {
      ok: true,
      next: b.result === 'Create Work Order' ? 'convert' : null,
      msg: `${r.number} triaged: ${b.result}.${extra}`,
    };
  }

  async convert(
    a: FsActor,
    id: string,
    b: { priority: string; scope: string; key?: string },
  ) {
    this.ctx.need(a, 'request', 'Converting requests');
    const r = await this.must(a, id);
    if (r.status !== 'Ready for Work Order' && !a.approve)
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'Triage first — only managers can convert untriaged requests.',
        HttpStatus.FORBIDDEN,
      );
    if (REQ_FINAL.includes(r.status))
      throw fsErr(FS_ERRORS.INVALID, `${r.number} is ${r.status}.`);
    if (!r.serviceTypeId)
      throw fsErr(
        FS_ERRORS.INVALID,
        'Set the service type during triage first.',
      );
    if (!b.scope?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Scope is required.');
    const d = await this.wos.load(a);
    const wr = r.assetId
      ? d.warranty.find(
          (x) =>
            x.assetId === r.assetId &&
            ['Eligible', 'Validating', 'Approval Required'].includes(
              x.status,
            ) &&
            !x.woId,
        )
      : undefined;
    const w = await this.ctx.once(
      a.rootId,
      b.key ?? `conv_${r.id}`,
      async () => {
        const made = await this.wos.create(
          { ...a, workorder: true },
          {
            customerId: r.customerId,
            siteId: r.siteId,
            assetId: r.assetId,
            serviceTypeId: r.serviceTypeId!,
            scope: b.scope,
            priority: b.priority || r.priority,
            requestId: r.id,
            warrantyId:
              r.triageResult === 'Covered by Warranty'
                ? (wr?.id ?? null)
                : null,
            status: 'Approved',
            // The service type's parts template — listing parts never moves stock.
            parts: (
              (d.svc.get(r.serviceTypeId!)?.partProductIds as string[]) ?? []
            ).map((productId) => ({ productId, qty: 1 })),
          },
          d,
        );
        await this.db.fsRequest.update({
          where: { id: r.id },
          data: { status: 'Converted', woId: made.id, outcome: made.number },
        });
        if (wr && r.triageResult === 'Covered by Warranty')
          await this.db.fsWarranty.update({
            where: { id: wr.id },
            data: {
              woId: made.id,
              status: wr.status === 'Eligible' ? 'WO Created' : wr.status,
            },
          });
        await this.ctx.audit(
          a.rootId,
          a,
          'Request converted',
          'request',
          r.id,
          `${r.number} → ${made.number} · event field.request.converted`,
        );
        return made;
      },
    );
    return {
      ok: true,
      id: w.id,
      number: w.number,
      msg: `${r.number} → ${w.number} (${w.status}, unassigned). Assign it on the dispatch board.`,
    };
  }

  async moreInfo(a: FsActor, id: string, text: string) {
    this.ctx.need(a, 'request', 'Asking customers for information');
    if (!text?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Required.');
    const r = await this.must(a, id);
    const d = await this.wos.load(a);
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'manual',
      customerId: r.customerId,
      templateKey: 'field_update',
      variables: { ref: r.number, businessName: d.biz.name, body: text.trim() },
    });
    if (!n.sent)
      throw fsErr(
        FS_ERRORS.INVALID,
        `Not sent — ${n.why}. The request is unchanged.`,
      );
    const notes = Array.isArray(r.notes) ? (r.notes as string[]) : [];
    await this.db.fsRequest.update({
      where: { id: r.id },
      data: {
        status: 'Need More Information',
        notes: [...notes, `Asked customer: ${text.trim()}`],
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'More information requested',
      'request',
      r.id,
      `${r.number} · ${n.why}`,
    );
    return {
      ok: true,
      msg: `Question delivered (${n.why}). The request waits for the customer.`,
    };
  }

  async reject(a: FsActor, id: string, b: { reason: string; cust?: string }) {
    this.ctx.need(a, 'request', 'Rejecting requests');
    if (!b.reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    const r = await this.must(a, id);
    if (REQ_FINAL.includes(r.status))
      throw fsErr(FS_ERRORS.INVALID, `${r.number} is ${r.status}.`);
    await this.db.fsRequest.update({
      where: { id: r.id },
      data: { status: 'Rejected', outcome: b.reason.trim().slice(0, 255) },
    });
    let sent = '';
    if (b.cust?.trim()) {
      const d = await this.wos.load(a);
      sent = (
        await this.notify.send({
          cfg: d.cfg,
          tz: d.tz,
          kind: 'manual',
          customerId: r.customerId,
          templateKey: 'field_update',
          variables: {
            ref: r.number,
            businessName: d.biz.name,
            body: b.cust.trim(),
          },
        })
      ).why;
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Request rejected',
      'request',
      r.id,
      `${r.number} · ${b.reason}${sent ? ` · customer: ${sent}` : ''}`,
    );
    return {
      ok: true,
      msg: `${r.number} rejected.${sent ? ` Customer explanation: ${sent}.` : ''}`,
    };
  }

  /**
   * Assets & Maintenance → Field Service: an asset request or work order on a customer-owned asset
   * becomes a field service request (customer and site from the asset record). Internal assets stay
   * in Assets work orders. Idempotent per source record.
   */
  async fromAssets(a: FsActor, kind: 'req' | 'wo', id: string) {
    this.ctx.need(a, 'request', 'Creating service requests');
    const src =
      kind === 'req'
        ? await this.db.amRequest.findFirst({
            where: { id, businessId: a.rootId },
          })
        : await this.db.amWorkOrder.findFirst({
            where: { id, businessId: a.rootId },
          });
    if (!src)
      throw notFound(
        kind === 'req' ? 'Maintenance request' : 'Maintenance work order',
      );
    const asset = await this.db.amAsset.findFirst({
      where: { id: src.assetId, businessId: a.rootId },
    });
    if (!asset) throw notFound('Asset');
    if (!asset.customerId)
      throw fsErr(
        FS_ERRORS.INVALID,
        `${asset.number} has no customer in Assets — only customer-owned equipment is dispatched as a field job. Internal assets stay in Assets work orders.`,
      );
    const ref = `${src.number}`;
    const prev = await this.db.fsRequest.findFirst({
      where: {
        businessId: a.rootId,
        channel: 'Assets & Maintenance',
        sourceRef: ref,
      },
    });
    if (prev)
      return {
        id: prev.id,
        number: prev.number,
        msg: `Already linked — ${prev.number} (${prev.status}).`,
      };
    const prio: Record<string, string> = {
      Critical: 'Urgent',
      High: 'High',
      Medium: 'Normal',
      Low: 'Low',
    };
    const title = 'title' in src ? src.title : src.scope;
    const r = await this.create(a, {
      customerId: asset.customerId,
      assetId: asset.id,
      issue:
        `${title}${'description' in src && src.description ? ` — ${src.description}` : ''}`.slice(
          0,
          4000,
        ),
      priority: prio[src.priority] ?? 'Normal',
      channel: 'Assets & Maintenance',
      sourceRef: ref,
      dupOk: true,
    });
    if (!('number' in r) || !r.number)
      throw fsErr(FS_ERRORS.INVALID, 'Could not create the service request.');
    await this.ctx.audit(
      a.rootId,
      a,
      'Linked from Assets & Maintenance',
      'request',
      r.id,
      `${ref} → ${r.number}`,
    );
    return {
      id: r.id,
      number: r.number,
      msg: `${ref} handed to Field Service as ${r.number} — triage it there.`,
    };
  }

  /** Hand the request to Helpdesk as a real ticket (system-created) and keep the ticket number. */
  async toHelpdesk(a: FsActor, id: string, note?: string) {
    this.ctx.need(a, 'request', 'Sending to Helpdesk');
    const r = await this.must(a, id);
    if (r.helpdeskTicketId)
      throw fsErr(
        FS_ERRORS.DUPLICATE,
        'Already sent to Helpdesk.',
        HttpStatus.CONFLICT,
      );
    const cfg = await this.hdCtx.config(a.rootId);
    const category =
      cfg.categories.find((c) => /tech|service|repair|support/i.test(c)) ??
      cfg.categories[0];
    if (!category)
      throw fsErr(
        FS_ERRORS.INVALID,
        'Helpdesk has no categories yet — add one in Helpdesk › Settings.',
      );
    const prio =
      {
        Emergency: 'Urgent',
        Urgent: 'Urgent',
        High: 'High',
        Normal: 'Normal',
        Low: 'Low',
      }[r.priority] ?? 'Normal';
    const ch =
      { Phone: 'Phone', 'Customer Portal': 'Portal', Website: 'Web' }[
        r.channel
      ] ?? 'Manual';
    const t = await this.hdTickets.create(null, a.rootId, {
      customerId: r.customerId,
      subject: `Field request ${r.number}: ${r.issue.slice(0, 200)}`,
      description: `${r.issue}${note ? `\n\nTriage note: ${note}` : ''}\n\nHanded over from Field Service by ${a.name}.`,
      channel: ch,
      category,
      priority: prio,
      origin: `Created from Field Service request ${r.number} by ${a.name}`,
    });
    const notes = Array.isArray(r.notes) ? (r.notes as string[]) : [];
    await this.db.fsRequest.update({
      where: { id: r.id },
      data: {
        status: 'Sent to Helpdesk',
        helpdeskTicketId: t.id,
        outcome: `Helpdesk ${t.number}`,
        triageResult: 'Send to Helpdesk',
        triagedAt: new Date(),
        notes: note?.trim() ? [...notes, note.trim()] : notes,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Sent to Helpdesk',
      'request',
      r.id,
      `${r.number} → ${t.number}`,
    );
    return { ok: true, msg: `${r.number} handed to Helpdesk as ${t.number}.` };
  }
}
