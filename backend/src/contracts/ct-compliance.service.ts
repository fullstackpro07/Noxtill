import { Injectable } from '@nestjs/common';
import {
  CtActor,
  CtContextService,
  ctErr,
  notFound,
} from './ct-context.service';
import { CtDocsService } from './ct-docs.service';
import { Upload } from './ct-files.service';
import { CMP_TYPES, CT_ERRORS } from './ct.constants';

export interface CmpIn {
  title?: string;
  type?: string;
  jurisdiction?: string;
  audience?: string;
  ack?: boolean | string;
  eff?: string;
  exp?: string | null;
  material?: boolean | string;
}

const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
const yes = (v: unknown) => v === true || v === '1' || v === 'true';

/**
 * Compliance register: policies, licences and certificates with their evidence file, and staff
 * acknowledgements per version. Status means “required evidence is present per your policy” —
 * never a legal compliance opinion. Acknowledgements are tracked for staff only.
 */
@Injectable()
export class CtComplianceService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly docs: CtDocsService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async get(a: CtActor, id: string) {
    const x = await this.db.ctCompliance.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
      include: { acks: true },
    });
    if (!x) throw notFound('Compliance record');
    return x;
  }

  async audience(a: CtActor, aud: string) {
    const members = await this.ctx.members(a.rootId);
    if (aud === 'All staff') return members;
    if (aud.startsWith('Branch:'))
      return members.filter((m) => m.businessId === aud.slice(7));
    return [];
  }

  private async validAudience(a: CtActor, aud: string | undefined) {
    const group = await this.ctx.branches(a.rootId);
    const ok = [
      'All staff',
      'Customers',
      'Suppliers',
      ...group.map((g) => `Branch:${g.id}`),
    ];
    return ok.includes(aud ?? '') ? aud! : 'All staff';
  }

  async create(a: CtActor, i: CmpIn, file: Upload | null) {
    this.ctx.need(a, 'compliance', 'Managing compliance documents');
    const title = (i.title ?? '').trim();
    if (!title) throw ctErr(CT_ERRORS.INVALID, 'Title required.');
    const aud = await this.validAudience(a, i.audience);
    const ack = yes(i.ack);
    if (ack && ['Customers', 'Suppliers'].includes(aud))
      throw ctErr(
        CT_ERRORS.INVALID,
        'Acknowledgements are tracked for staff only — pick a staff audience, or turn mandatory acknowledgement off.',
      );
    const exp = day(i.exp ?? null);
    const doc = file
      ? (
          await this.docs.create(
            a,
            {
              title,
              type:
                CMP_TYPES.includes(i.type ?? '') &&
                [
                  'Policy',
                  'License',
                  'Certificate',
                  'Insurance Proof',
                  'Registration',
                ].includes(i.type!)
                  ? i.type
                  : 'Other',
              folder: 'Compliance',
              sensitivity: 'Internal',
              expiresOn: i.exp ?? null,
              retention: '10 years',
              tags: ['compliance'],
            },
            [file],
          )
        )[0]
      : null;
    const x = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'cmp', tx);
      return tx.ctCompliance.create({
        data: {
          businessId: a.rootId,
          number,
          docId: doc?.id ?? null,
          title: title.slice(0, 255),
          type: CMP_TYPES.includes(i.type ?? '') ? i.type! : 'Custom',
          jurisdiction: (i.jurisdiction ?? '').trim().slice(0, 80) || '—',
          ownerId: a.userId,
          version: doc ? 1 : 0,
          effectiveOn: day(i.eff),
          expiresOn: exp,
          mandatoryAck: ack,
          audience: aud,
        },
      });
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Compliance document registered',
      'compliance',
      x.id,
      `${x.number} · ${title}${doc ? ` · evidence ${doc.number}` : ' · no evidence yet'}`,
    );
    return { id: x.id, number: x.number, doc: doc?.number ?? null };
  }

  /** Evidence upload / replacement. A material change bumps the version, so everyone re-acknowledges. */
  async upload(a: CtActor, id: string, i: CmpIn, file: Upload | null) {
    this.ctx.need(a, 'compliance', 'Uploading compliance evidence');
    const x = await this.get(a, id);
    if (x.archivedAt)
      throw ctErr(CT_ERRORS.STATUS, 'Archived — restore it first.');
    if (!file) throw ctErr(CT_ERRORS.INVALID, 'Choose the evidence file.');
    let docId = x.docId;
    if (docId)
      await this.docs.newVersion(
        a,
        docId,
        yes(i.material)
          ? 'Material change — re-acknowledgement required'
          : 'Replacement evidence',
        file,
      );
    else
      docId = (
        await this.docs.create(
          a,
          {
            title: x.title,
            type: 'Other',
            folder: 'Compliance',
            sensitivity: 'Internal',
            expiresOn: i.exp ?? null,
            retention: '10 years',
            tags: ['compliance'],
          },
          [file],
        )
      )[0].id;
    const material = yes(i.material) || x.version === 0;
    await this.db.ctCompliance.update({
      where: { id: x.id },
      data: {
        docId,
        version: material ? x.version + 1 : x.version,
        effectiveOn: day(i.eff) ?? x.effectiveOn,
        expiresOn: i.exp === undefined ? x.expiresOn : day(i.exp ?? null),
      },
    });
    await this.db.ctExpiryState.deleteMany({
      where: { businessId: a.rootId, key: `k:${x.id}` },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Compliance evidence uploaded',
      'compliance',
      x.id,
      `${x.number}${material && x.version ? ` · material change — v${x.version + 1}, re-acknowledgement required` : ''}`,
    );
    return { version: material ? x.version + 1 : x.version };
  }

  /** Locks the current evidence version and, when acknowledgement is mandatory, asks the audience. */
  async publish(a: CtActor, id: string) {
    this.ctx.need(a, 'compliance', 'Publishing compliance documents');
    const x = await this.get(a, id);
    if (!x.docId) throw ctErr(CT_ERRORS.INVALID, 'Upload the evidence first.');
    const v = await this.db.ctDocVersion.findFirst({
      where: { docId: x.docId },
      orderBy: { version: 'desc' },
    });
    if (v)
      await this.db.ctDocVersion.update({
        where: { id: v.id },
        data: { immutable: true, state: 'Active' },
      });
    await this.db.ctDocument.update({
      where: { id: x.docId },
      data: { status: 'Active' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Compliance document published',
      'compliance',
      x.id,
      `${x.number} v${x.version} · evidence version locked`,
    );
    const n = x.mandatoryAck
      ? (
          await this.requestAck(
            a,
            id,
            'pending',
            `Please read and acknowledge ${x.title} v${x.version}.`,
          )
        ).n
      : 0;
    return { requested: n };
  }

  async requestAck(a: CtActor, id: string, scope: string, msg: string) {
    this.ctx.need(a, 'compliance', 'Requesting acknowledgements');
    const x = await this.get(a, id);
    if (!x.mandatoryAck)
      throw ctErr(
        CT_ERRORS.INVALID,
        'Acknowledgement isn’t required for this document.',
      );
    if (!x.version)
      throw ctErr(
        CT_ERRORS.INVALID,
        'Upload the evidence first — there’s nothing to acknowledge yet.',
      );
    const aud = await this.audience(a, x.audience);
    const done = new Set(
      x.acks
        .filter((k) => k.version === x.version && k.status === 'Acknowledged')
        .map((k) => k.userId),
    );
    const targets = aud.filter((m) => scope === 'all' || !done.has(m.id));
    for (const m of targets)
      await this.db.ctAck.upsert({
        where: {
          complianceId_userId_version: {
            complianceId: x.id,
            userId: m.id,
            version: x.version,
          },
        },
        create: {
          complianceId: x.id,
          userId: m.id,
          version: x.version,
          status: done.has(m.id) ? 'Acknowledged' : 'Requested',
        },
        update: { requestedAt: new Date() },
      });
    const notify = targets.filter((m) => !done.has(m.id)).map((m) => m.id);
    await this.ctx.notify(
      a.rootId,
      notify,
      `Please acknowledge · ${x.title}`,
      msg.trim() || `Read and acknowledge ${x.title} v${x.version}.`,
      '/contracts/compliance',
      a.userId,
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Acknowledgement requested',
      'compliance',
      x.id,
      `${x.number} v${x.version} · ${notify.length} person(s) notified in-app`,
    );
    return { n: notify.length };
  }

  /** The signed-in staff member acknowledges the current version. */
  async acknowledge(a: CtActor, id: string) {
    const x = await this.get(a, id);
    if (!x.mandatoryAck || !x.version)
      throw ctErr(CT_ERRORS.INVALID, 'There’s nothing to acknowledge.');
    if (!(await this.audience(a, x.audience)).some((m) => m.id === a.userId))
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'You aren’t in this document’s audience.',
      );
    await this.db.ctAck.upsert({
      where: {
        complianceId_userId_version: {
          complianceId: x.id,
          userId: a.userId,
          version: x.version,
        },
      },
      create: {
        complianceId: x.id,
        userId: a.userId,
        version: x.version,
        status: 'Acknowledged',
        ackedAt: new Date(),
      },
      update: { status: 'Acknowledged', ackedAt: new Date() },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Compliance acknowledged',
      'compliance',
      x.id,
      `${x.number} v${x.version}`,
    );
    return { ok: true };
  }

  async archive(a: CtActor, id: string, reason: string, restore = false) {
    this.ctx.need(a, 'compliance', 'Archiving compliance documents');
    const x = await this.get(a, id);
    if (!restore && !reason.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    await this.db.ctCompliance.update({
      where: { id: x.id },
      data: { archivedAt: restore ? null : new Date() },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      restore ? 'Compliance document restored' : 'Compliance document archived',
      'compliance',
      x.id,
      `${x.number}${reason ? ` · ${reason}` : ''} · evidence and acknowledgement logs retained`,
    );
    return { ok: true };
  }
}
