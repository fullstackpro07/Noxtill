import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt } from 'crypto';
import { EmailService } from '../messaging/channels/email.service';
import {
  CtActor,
  CtContextService,
  Tx,
  ctErr,
  notFound,
  num,
} from './ct-context.service';
import { CtFilesService, sha256 } from './ct-files.service';
import {
  CT_ERRORS,
  REMIND_DAYS,
  SIGNER_ROLES,
  SIG_FIELDS,
} from './ct.constants';

export interface SigIn {
  docId?: string;
  signers?: { name?: string; email?: string; role?: string }[];
  order?: string;
  fields?: string[];
  auth?: string;
  reminders?: string;
  deadline?: string;
  send?: boolean;
}

const LIVE = ['Sent', 'Partially Signed'];
const OTP_TTL = 10 * 60_000;
const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59Z`) : null;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const token = () => randomBytes(24).toString('base64url');

type Req = NonNullable<Awaited<ReturnType<CtEsignService['load']>>>;

/**
 * Noxtill eSign — the built-in signature flow. Signers get a single-use tokenised link by email
 * (the token is only ever in the link; we store its hash), optionally confirm an emailed OTP, then
 * type or draw their signature. Evidence per signer: timestamps, IP, user agent, method, and the
 * SHA-256 of the exact version bytes, re-checked at signing time. Completion locks that version.
 */
@Injectable()
export class CtEsignService {
  private readonly log = new Logger(CtEsignService.name);

  constructor(
    private readonly ctx: CtContextService,
    private readonly files: CtFilesService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private link(t: string) {
    return `${(this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '')}/sign/${t}`;
  }

  load(rootId: string, id: string) {
    return this.db.ctSignRequest.findFirst({
      where: { businessId: rootId, OR: [{ id }, { number: id }] },
      include: { signers: { orderBy: { seq: 'asc' } } },
    });
  }

  private async req(a: CtActor, id: string) {
    const s = await this.load(a.rootId, id);
    if (!s) throw notFound('Signature request');
    return s;
  }

  private async event(
    requestId: string,
    type: string,
    detail: string,
    o: { signerId?: string | null; ip?: string | null; tx?: Tx } = {},
  ) {
    await (o.tx ?? this.db).ctSignEvent.create({
      data: {
        requestId,
        type,
        detail: detail.slice(0, 500),
        signerId: o.signerId ?? null,
        ip: o.ip ?? null,
      },
    });
  }

  /** Whose turn it is: everyone pending in parallel; the first unsigned signer in sequence. */
  private turn(s: Req) {
    const open = s.signers.filter(
      (x) => !['Signed', 'Declined'].includes(x.status),
    );
    return s.ordering === 'Parallel' ? open : open.slice(0, 1);
  }

  // ── prepare & send ────────────────────────────────────────────────────

  async prepare(a: CtActor, i: SigIn) {
    this.ctx.need(a, 'manage', 'Preparing signature requests');
    const cfg = await this.ctx.config(a.rootId);
    const doc = await this.db.ctDocument.findFirst({
      where: {
        businessId: a.rootId,
        OR: [{ id: i.docId ?? '' }, { number: i.docId ?? '' }],
      },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!doc) throw ctErr(CT_ERRORS.INVALID, 'Choose a document.');
    if (doc.sensitivity === 'Restricted' && !a.restricted)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — restricted document.',
        HttpStatus.FORBIDDEN,
      );
    if (doc.archivedAt)
      throw ctErr(
        CT_ERRORS.STATUS,
        'Archived documents can’t be sent for signature.',
      );
    const v = doc.versions[0];
    if (!v?.storageKey || !v.sha256)
      throw ctErr(
        CT_ERRORS.INVALID,
        `${doc.number} has no file to sign — upload one first.`,
      );
    if (v.state === 'Signed')
      throw ctErr(
        CT_ERRORS.STATUS,
        `${doc.number} v${v.version} is already signed.`,
      );
    const active = await this.db.ctSignRequest.findFirst({
      where: {
        businessId: a.rootId,
        docId: doc.id,
        status: { in: ['Prepared', ...LIVE] },
      },
    });
    if (active)
      throw ctErr(
        CT_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — ${doc.number} already has an active signature request (${active.number}).`,
        HttpStatus.CONFLICT,
      );
    const ct = await this.db.ctContract.findFirst({
      where: { businessId: a.rootId, docId: doc.id },
    });
    if (ct && !['Approved', 'Signature Pending'].includes(ct.status))
      throw ctErr(
        CT_ERRORS.APPROVAL,
        `APPROVAL_REQUIRED — contract ${ct.number} is ${ct.status}. It must be approved before signature.`,
      );
    const amd = await this.db.ctAmendment.findFirst({
      where: { docId: doc.id },
      include: { contract: true },
    });
    if (amd && amd.status !== 'Approved')
      throw ctErr(
        CT_ERRORS.APPROVAL,
        `APPROVAL_REQUIRED — ${amd.contract.number} ${amd.number} is ${amd.status}. It must be approved before signature.`,
      );
    const signers = (i.signers ?? []).filter((x) => x.name?.trim());
    if (!signers.length)
      throw ctErr(
        CT_ERRORS.SIGNER,
        'MISSING_SIGNER — add at least one signer.',
      );
    if (signers.length > 6)
      throw ctErr(CT_ERRORS.INVALID, 'Up to 6 signers per request.');
    for (const [k, x] of signers.entries())
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((x.email ?? '').trim()))
        throw ctErr(
          CT_ERRORS.SIGNER,
          `MISSING_SIGNER — signer ${k + 1} needs a valid email.`,
        );
    if (
      new Set(signers.map((x) => x.email!.trim().toLowerCase())).size !==
      signers.length
    )
      throw ctErr(
        CT_ERRORS.INVALID,
        'VALIDATION_ERROR — the same email appears twice.',
      );
    const fields = (i.fields ?? ['Signature', 'Date', 'Name']).filter((f) =>
      SIG_FIELDS.includes(f),
    );
    if (!fields.includes('Signature'))
      throw ctErr(CT_ERRORS.INVALID, 'Place at least one Signature field.');
    const auth = cfg.auth.methods.includes(i.auth ?? '')
      ? i.auth!
      : (cfg.auth.methods[0] ?? 'Email');
    const otpNeeded =
      (ct && ct.value != null && num(ct.value) > cfg.auth.otpAbove) ||
      (ct?.type === 'Employment Contract' && cfg.auth.otpEmployees);
    if (otpNeeded && auth !== 'Email + OTP')
      throw ctErr(
        CT_ERRORS.INVALID,
        `Settings › Signer authentication requires Email + OTP for ${ct?.type === 'Employment Contract' ? 'employment contracts' : `contracts above ${cfg.auth.otpAbove.toLocaleString()}`}.`,
      );
    const deadline =
      day(i.deadline) ?? new Date(Date.now() + cfg.esign.expiryDays * 86400000);
    if (deadline <= new Date())
      throw ctErr(CT_ERRORS.INVALID, 'Expiry must be in the future.');
    const reminders = Object.keys(REMIND_DAYS).includes(i.reminders ?? '')
      ? i.reminders!
      : cfg.esign.reminders;
    const order = i.order === 'Parallel' ? 'Parallel' : 'Sequential';
    const s = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'sig', tx);
      const r = await tx.ctSignRequest.create({
        data: {
          businessId: a.rootId,
          number,
          docId: doc.id,
          docVersion: v.version,
          contractId: ct?.id ?? amd?.contractId ?? null,
          amendmentId: amd?.id ?? null,
          senderId: a.userId,
          ordering: order,
          fields,
          reminders,
          deadline,
          status: 'Prepared',
          docSha256: v.sha256,
          signers: {
            create: signers.map((x, k) => ({
              name: x.name!.trim().slice(0, 160),
              email: x.email!.trim().slice(0, 190),
              role: SIGNER_ROLES.includes(x.role ?? '')
                ? x.role!
                : 'Counterparty',
              seq: k + 1,
              auth,
              status: 'Pending',
              tokenHash: sha256(token()),
            })),
          },
        },
      });
      await this.event(
        r.id,
        'request.prepared',
        `${number} · ${doc.number} v${v.version} · sha256 ${v.sha256!.slice(0, 16)}… · ${signers.length} signer(s) · ${order}`,
        { tx },
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Signature request prepared',
        'signature',
        r.id,
        `${number} · ${doc.number} v${v.version} · ${signers.map((x) => x.name).join(', ')}`,
        { tx },
      );
      return r;
    });
    if (i.send) return { number: s.number, ...(await this.send(a, s.id)) };
    return { number: s.number, status: 'Prepared' };
  }

  /** Emails a fresh signing link to one signer (rotating the token). */
  private async deliver(
    s: Req,
    x: Req['signers'][number],
    kind: 'request' | 'reminder',
    bizName: string,
    title: string,
  ) {
    const t = token();
    await this.db.ctSigner.update({
      where: { id: x.id },
      data: { tokenHash: sha256(t) },
    });
    const text = `${kind === 'reminder' ? 'Reminder: ' : ''}${bizName} has sent you “${title}” to sign as ${x.role}.\n\nReview and sign here: ${this.link(t)}\n\nThis link is personal to you and expires on ${iso(s.deadline)}.${x.auth === 'Email + OTP' ? ' You’ll be asked for a one-time code sent to this address.' : ''}\nIf you weren’t expecting this, you can ignore this email.`;
    try {
      await this.email.send({
        to: x.email,
        text,
        templateKey:
          kind === 'reminder' ? 'signature_reminder' : 'signature_request',
        locale: 'en',
        businessId: s.businessId,
      });
      await this.db.ctSigner.update({
        where: { id: x.id },
        data: {
          status: x.status === 'Viewed' ? 'Viewed' : 'Sent',
          sentAt: x.sentAt ?? new Date(),
          lastReminded: kind === 'reminder' ? new Date() : x.lastReminded,
        },
      });
      await this.event(
        s.id,
        kind === 'reminder' ? 'signer.reminded' : 'signer.sent',
        `${x.name} <${x.email}>`,
        { signerId: x.id },
      );
      return true;
    } catch (e) {
      this.log.warn(
        `Signature email to ${x.email} failed: ${(e as Error).message}`,
      );
      await this.db.ctSigner.update({
        where: { id: x.id },
        data: { status: 'Delivery Failed' },
      });
      await this.event(
        s.id,
        'signer.delivery_failed',
        `${x.name} <${x.email}> · ${(e as Error).message}`.slice(0, 500),
        { signerId: x.id },
      );
      return false;
    }
  }

  private async meta(rootId: string, s: { docId: string }) {
    const [biz, doc] = await Promise.all([
      this.ctx.business(rootId),
      this.db.ctDocument.findUnique({ where: { id: s.docId } }),
    ]);
    return { biz: biz.name, title: doc?.title ?? 'Document' };
  }

  async send(a: CtActor, id: string) {
    this.ctx.need(a, 'manage', 'Sending signature requests');
    const s = await this.req(a, id);
    if (
      !['Prepared', 'Expired'].includes(s.status) &&
      !(
        LIVE.includes(s.status) &&
        s.signers.some((x) => x.status === 'Delivery Failed')
      )
    )
      throw ctErr(
        CT_ERRORS.STATUS,
        `${s.number} is ${s.status} — nothing to send.`,
      );
    const cfg = await this.ctx.config(a.rootId);
    if (s.contractId) {
      const c = await this.db.ctContract.findUnique({
        where: { id: s.contractId },
      });
      if (
        c &&
        !s.amendmentId &&
        !['Approved', 'Signature Pending', 'Partially Signed'].includes(
          c.status,
        )
      )
        throw ctErr(
          CT_ERRORS.APPROVAL,
          `APPROVAL_REQUIRED — ${c.number} must be approved first.`,
        );
    }
    return this.ctx.once(
      a.rootId,
      `sig:send:${s.id}:${s.updatedAt.getTime()}`,
      async () => {
        const deadline =
          s.status === 'Expired'
            ? new Date(Date.now() + cfg.esign.expiryDays * 86400000)
            : s.deadline;
        await this.db.ctSignRequest.update({
          where: { id: s.id },
          data: {
            status:
              s.status === 'Partially Signed' ? 'Partially Signed' : 'Sent',
            sentAt: s.sentAt ?? new Date(),
            deadline,
          },
        });
        if (s.status === 'Expired')
          await this.db.ctSigner.updateMany({
            where: {
              requestId: s.id,
              status: { notIn: ['Signed', 'Declined'] },
            },
            data: { status: 'Pending' },
          });
        const fresh = (await this.load(a.rootId, s.id))!;
        const m = await this.meta(a.rootId, s);
        let ok = 0;
        let bad = 0;
        const targets = LIVE.includes(s.status)
          ? this.turn(fresh).filter((x) => x.status === 'Delivery Failed')
          : this.turn(fresh);
        for (const x of targets)
          if (await this.deliver(fresh, x, 'request', m.biz, m.title)) ok++;
          else bad++;
        await this.sync(a.rootId, s.id);
        await this.ctx.audit(
          a.rootId,
          a,
          'Signature request sent',
          'signature',
          s.id,
          `${s.number} · ${ok} delivered${bad ? ` · ${bad} failed` : ''}`,
        );
        return {
          status: 'Sent',
          delivered: ok,
          failed: bad,
          message: bad
            ? `${bad} email(s) failed — the signers show Delivery Failed. Check the address, or give them a signing link yourself.`
            : `Signing link emailed to ${ok} signer(s).`,
        };
      },
    );
  }

  async remind(a: CtActor, id: string) {
    this.ctx.need(a, 'manage', 'Sending reminders');
    const s = await this.req(a, id);
    if (!LIVE.includes(s.status))
      throw ctErr(CT_ERRORS.STATUS, `${s.number} is ${s.status}.`);
    const m = await this.meta(a.rootId, s);
    const who: string[] = [];
    for (const x of this.turn(s))
      if (await this.deliver(s, x, 'reminder', m.biz, m.title))
        who.push(x.name);
    await this.ctx.audit(
      a.rootId,
      a,
      'Signature reminder sent',
      'signature',
      s.id,
      `${s.number} · ${who.join(', ') || 'none delivered'}`,
    );
    return { to: who };
  }

  /** A signing link handed to the sender (in-person signing, or when email can't reach the signer). */
  async manualLink(a: CtActor, id: string, signerId: string) {
    this.ctx.need(a, 'manage', 'Issuing signing links');
    const s = await this.req(a, id);
    if (!LIVE.includes(s.status))
      throw ctErr(
        CT_ERRORS.STATUS,
        `${s.number} is ${s.status} — send it first.`,
      );
    const x = s.signers.find((y) => y.id === signerId);
    if (!x) throw notFound('Signer');
    if (!this.turn(s).some((y) => y.id === x.id))
      throw ctErr(
        CT_ERRORS.STATUS,
        `It isn’t ${x.name}’s turn yet (sequential order).`,
      );
    const t = token();
    await this.db.ctSigner.update({
      where: { id: x.id },
      data: {
        tokenHash: sha256(t),
        status: ['Pending', 'Delivery Failed'].includes(x.status)
          ? 'Sent'
          : x.status,
        sentAt: x.sentAt ?? new Date(),
      },
    });
    await this.event(
      s.id,
      'signer.link_issued',
      `Link for ${x.name} handed to ${a.name} for manual delivery`,
      { signerId: x.id },
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Signing link issued',
      'signature',
      s.id,
      `${s.number} · ${x.name} · given to the sender (previous links stop working)`,
    );
    await this.sync(a.rootId, s.id);
    return {
      url: this.link(t),
      note: 'Anyone with this link can sign as this person — hand it over only to them. Earlier links for this signer no longer work.',
    };
  }

  async void(a: CtActor, id: string, reason: string) {
    this.ctx.need(a, 'manage', 'Voiding signature requests');
    const s = await this.req(a, id);
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    if (!['Prepared', ...LIVE].includes(s.status))
      throw ctErr(CT_ERRORS.STATUS, `${s.number} is ${s.status}.`);
    await this.db.$transaction(async (tx) => {
      await tx.ctSignRequest.update({
        where: { id: s.id },
        data: {
          status: 'Voided',
          note: `Voided: ${reason.trim()}`.slice(0, 500),
        },
      });
      await this.event(s.id, 'request.voided', reason.trim(), { tx });
      await this.unwind(s, 'Voided', tx);
      await this.ctx.audit(
        a.rootId,
        a,
        'Signature request voided',
        'signature',
        s.id,
        `${s.number} · ${reason.trim()} · document version unlocked for a new request`,
        { tx },
      );
    });
    return { ok: true };
  }

  /** A request ending without completion returns the contract / amendment to Approved. */
  private async unwind(
    s: { contractId: string | null; amendmentId: string | null },
    st: string,
    tx: Tx,
  ) {
    if (s.amendmentId)
      await tx.ctAmendment.update({
        where: { id: s.amendmentId },
        data: { sigState: st, status: 'Approved' },
      });
    else if (s.contractId) {
      const c = await tx.ctContract.findUnique({ where: { id: s.contractId } });
      if (c && ['Signature Pending', 'Partially Signed'].includes(c.status))
        await tx.ctContract.update({
          where: { id: c.id },
          data: { status: 'Approved', sigState: st, version: { increment: 1 } },
        });
      else if (c)
        await tx.ctContract.update({
          where: { id: c.id },
          data: { sigState: st },
        });
    }
  }

  /** Recomputes request status from signers and mirrors it onto the contract / amendment. */
  private async sync(rootId: string, id: string) {
    const s = (await this.load(rootId, id))!;
    if (!LIVE.includes(s.status)) return s;
    const signed = s.signers.filter((x) => x.status === 'Signed').length;
    const st =
      signed === s.signers.length
        ? 'Completed'
        : signed
          ? 'Partially Signed'
          : 'Sent';
    if (st === 'Completed') return this.complete(rootId, s);
    await this.db.ctSignRequest.update({
      where: { id: s.id },
      data: { status: st },
    });
    if (s.amendmentId)
      await this.db.ctAmendment.update({
        where: { id: s.amendmentId },
        data: { sigState: st, status: 'Signature Pending' },
      });
    else if (s.contractId) {
      const c = await this.db.ctContract.findUnique({
        where: { id: s.contractId },
      });
      if (c)
        await this.db.ctContract.update({
          where: { id: c.id },
          data: {
            sigState: st,
            status:
              c.status === 'Approved' ||
              c.status === 'Signature Pending' ||
              c.status === 'Partially Signed'
                ? st === 'Partially Signed'
                  ? 'Partially Signed'
                  : 'Signature Pending'
                : c.status,
          },
        });
    }
    if (s.docId)
      await this.db.ctDocument.update({
        where: { id: s.docId },
        data: { status: 'Signature Pending' },
      });
    return s;
  }

  private async complete(rootId: string, s: Req) {
    const cfg = await this.ctx.config(rootId);
    await this.db.$transaction(async (tx) => {
      const n = await tx.ctSignRequest.updateMany({
        where: { id: s.id, status: { in: LIVE } },
        data: { status: 'Completed', completedAt: new Date() },
      });
      if (!n.count) return;
      await tx.ctDocVersion.updateMany({
        where: { docId: s.docId, version: s.docVersion },
        data: { state: 'Signed', immutable: true },
      });
      await this.event(
        s.id,
        'request.completed',
        `All ${s.signers.length} signature(s) captured · v${s.docVersion} locked`,
        { tx },
      );
      if (s.amendmentId) {
        const m = await tx.ctAmendment.update({
          where: { id: s.amendmentId },
          data: { sigState: 'Completed', status: 'Active' },
        });
        await tx.ctDocument.update({
          where: { id: s.docId },
          data: { status: 'Active' },
        });
        await this.ctx.audit(
          rootId,
          { name: 'Noxtill eSign' },
          'Amendment signed',
          'contract',
          m.contractId,
          `${m.number} active from ${iso(m.effectiveOn)} · ${s.number}`,
          { tx },
        );
      } else if (s.contractId) {
        const c = await tx.ctContract.findUnique({
          where: { id: s.contractId },
        });
        if (c) {
          await tx.ctContract.update({
            where: { id: c.id },
            data: {
              status: 'Active',
              sigState: 'Completed',
              version: { increment: 1 },
            },
          });
          await tx.ctDocument.update({
            where: { id: s.docId },
            data: { status: 'Active' },
          });
          await this.ctx.audit(
            rootId,
            { name: 'Noxtill eSign' },
            'Contract signed',
            'contract',
            c.id,
            `${c.number}: ${c.status} → Signed → Active · ${s.number} · v${s.docVersion} locked`,
            { tx },
          );
          if (c.renewalOf) {
            const o = await tx.ctContract.findUnique({
              where: { id: c.renewalOf },
            });
            if (
              o &&
              ['Active', 'Expiring', 'Renewal Review', 'Expired'].includes(
                o.status,
              )
            ) {
              await tx.ctContract.update({
                where: { id: o.id },
                data: {
                  status: o.status === 'Expired' ? 'Expired' : 'Renewed',
                  renewState: 'Renewed',
                  renewNote: `Renewed by ${c.number}`,
                  version: { increment: 1 },
                },
              });
              await this.ctx.audit(
                rootId,
                'System',
                'Contract renewed',
                'contract',
                o.id,
                `${o.number} → renewed by ${c.number}`,
                { tx },
              );
            }
          }
        }
      } else
        await tx.ctDocument.update({
          where: { id: s.docId },
          data: { status: 'Signed' },
        });
      await this.ctx.audit(
        rootId,
        { name: 'Noxtill eSign' },
        'Signature completed',
        'signature',
        s.id,
        `${s.number} · every signer signed · v${s.docVersion} immutable`,
        { tx },
      );
    });
    if (cfg.notify.signature)
      await this.ctx.notify(
        rootId,
        [s.senderId],
        `${s.number} completed`,
        'Every signer has signed. The signed version is now locked.',
        '/contracts/signatures',
      );
    return s;
  }

  // ── public signing page ───────────────────────────────────────────────

  private async byToken(t: string) {
    const x = await this.db.ctSigner.findUnique({
      where: { tokenHash: sha256(t ?? '') },
      include: {
        request: { include: { signers: { orderBy: { seq: 'asc' } } } },
      },
    });
    if (!x)
      throw ctErr(
        CT_ERRORS.NOT_FOUND,
        'This signing link isn’t valid any more — a newer link may have been sent. Use the latest email, or ask the sender.',
        HttpStatus.NOT_FOUND,
      );
    return x;
  }

  private gate(x: Awaited<ReturnType<CtEsignService['byToken']>>) {
    const s = x.request;
    if (s.status === 'Voided')
      return 'This request was cancelled by the sender.';
    if (s.status === 'Declined')
      return 'This request was declined, so it can’t be signed.';
    if (s.status === 'Expired' || s.deadline < new Date())
      return `This request expired on ${iso(s.deadline)}. Ask the sender for a new one.`;
    if (x.status === 'Signed') return null;
    if (!LIVE.includes(s.status)) return 'This request isn’t open for signing.';
    if (!this.turn(s).some((y) => y.id === x.id))
      return 'It isn’t your turn yet — earlier signers still need to sign.';
    return null;
  }

  async view(t: string, ip: string | null, ua: string | null) {
    const x = await this.byToken(t);
    const s = x.request;
    const [biz, doc, cfg] = await Promise.all([
      this.ctx.business(s.businessId),
      this.db.ctDocument.findUnique({
        where: { id: s.docId },
        include: { versions: { where: { version: s.docVersion } } },
      }),
      this.ctx.config(s.businessId),
    ]);
    const v = doc?.versions[0];
    const blocked = this.gate(x);
    if (!blocked && x.status !== 'Signed' && !x.viewedAt) {
      await this.db.ctSigner.update({
        where: { id: x.id },
        data: {
          viewedAt: new Date(),
          status: 'Viewed',
          ip: ip?.slice(0, 64) ?? null,
          userAgent: ua?.slice(0, 255) ?? null,
        },
      });
      await this.event(s.id, 'signer.viewed', `${x.name} opened the document`, {
        signerId: x.id,
        ip,
      });
    }
    return {
      business: biz.name,
      request: s.number,
      title: doc?.title ?? 'Document',
      version: s.docVersion,
      sha256: s.docSha256,
      text: v?.text ?? null,
      file: v?.storageKey
        ? {
            url: await this.files.url(v.storageKey),
            name: v.fileName,
            mime: v.mime,
          }
        : null,
      signer: {
        name: x.name,
        role: x.role,
        email: x.email,
        status: x.status,
        signedAt: x.signedAt,
      },
      others: s.signers
        .filter((y) => y.id !== x.id)
        .map((y) => ({ name: y.name, role: y.role, status: y.status })),
      fields: s.fields as string[],
      methods: cfg.esign.methods.filter((m) => ['Typed', 'Drawn'].includes(m)),
      otp: x.auth === 'Email + OTP',
      deadline: iso(s.deadline),
      blocked,
    };
  }

  async sendOtp(t: string) {
    const x = await this.byToken(t);
    const g = this.gate(x);
    if (g) throw ctErr(CT_ERRORS.STATUS, g);
    if (x.auth !== 'Email + OTP')
      throw ctErr(CT_ERRORS.INVALID, 'No code is needed for this request.');
    if (x.otpExpires && x.otpExpires.getTime() - OTP_TTL > Date.now() - 60_000)
      throw ctErr(
        CT_ERRORS.DUPLICATE,
        'A code was sent less than a minute ago — check your inbox.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.ctSigner.update({
      where: { id: x.id },
      data: {
        otpHash: sha256(`${x.id}:${code}`),
        otpExpires: new Date(Date.now() + OTP_TTL),
        otpAttempts: 0,
      },
    });
    try {
      await this.email.send({
        to: x.email,
        text: `Your signing code is ${code}. It expires in 10 minutes. Don’t share it.`,
        templateKey: 'signature_code',
        locale: 'en',
        businessId: x.request.businessId,
      });
    } catch (e) {
      throw ctErr(
        'DELIVERY_FAILED',
        `We couldn’t email the code — ${(e as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    await this.event(
      x.requestId,
      'signer.otp_sent',
      `Code emailed to ${x.email}`,
      { signerId: x.id },
    );
    return { sent: true };
  }

  async sign(
    t: string,
    b: { sigType?: string; sigData?: string; otp?: string; agree?: boolean },
    ip: string | null,
    ua: string | null,
  ) {
    const x = await this.byToken(t);
    const g = this.gate(x);
    if (g) throw ctErr(CT_ERRORS.STATUS, g);
    if (x.status === 'Signed')
      throw ctErr(CT_ERRORS.STATUS, 'You’ve already signed this document.');
    if (!b.agree)
      throw ctErr(
        CT_ERRORS.INVALID,
        'Confirm that you agree to sign electronically.',
      );
    const cfg = await this.ctx.config(x.request.businessId);
    const type = b.sigType === 'Drawn' ? 'Drawn' : 'Typed';
    if (!cfg.esign.methods.includes(type))
      throw ctErr(
        CT_ERRORS.INVALID,
        `${type} signatures aren’t allowed for this business.`,
      );
    const data = (b.sigData ?? '').trim();
    if (type === 'Typed' && (data.length < 2 || data.length > 160))
      throw ctErr(CT_ERRORS.SIGN, 'Type your full name as your signature.');
    if (
      type === 'Drawn' &&
      (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) ||
        data.length > 90_000)
    )
      throw ctErr(CT_ERRORS.SIGN, 'Draw your signature in the box.');
    if (x.auth === 'Email + OTP') {
      if (!x.otpHash || !x.otpExpires || x.otpExpires < new Date())
        throw ctErr(
          CT_ERRORS.SIGN,
          'Request a code first (codes last 10 minutes).',
        );
      if (x.otpAttempts >= 5)
        throw ctErr(
          CT_ERRORS.SIGN,
          'Too many wrong codes — request a new one.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (sha256(`${x.id}:${(b.otp ?? '').trim()}`) !== x.otpHash) {
        await this.db.ctSigner.update({
          where: { id: x.id },
          data: { otpAttempts: { increment: 1 } },
        });
        throw ctErr(CT_ERRORS.SIGN, 'That code isn’t right.');
      }
    }
    const v = await this.db.ctDocVersion.findFirst({
      where: { docId: x.request.docId, version: x.request.docVersion },
    });
    const intact = await this.files.verify(
      v?.storageKey ?? null,
      x.request.docSha256,
    );
    if (intact === false)
      throw ctErr(
        CT_ERRORS.SIGN,
        'SIGNATURE_INVALID — the stored file no longer matches what was sent. Nothing was signed; the sender has to start a new request.',
      );
    const n = await this.db.ctSigner.updateMany({
      where: { id: x.id, status: { not: 'Signed' } },
      data: {
        status: 'Signed',
        signedAt: new Date(),
        sigType: type,
        sigData: data,
        ip: ip?.slice(0, 64) ?? null,
        userAgent: ua?.slice(0, 255) ?? null,
        otpHash: null,
      },
    });
    if (!n.count)
      throw ctErr(CT_ERRORS.DUPLICATE, 'Already signed.', HttpStatus.CONFLICT);
    await this.event(
      x.requestId,
      'signer.signed',
      `${x.name} · ${type}${x.auth === 'Email + OTP' ? ' · OTP verified' : ' · email link'} · sha256 ${x.request.docSha256?.slice(0, 16)}… verified`,
      { signerId: x.id, ip },
    );
    const s = (await this.load(x.request.businessId, x.requestId))!;
    if (s.ordering === 'Sequential') {
      const nx = this.turn(s)[0];
      if (nx && nx.status === 'Pending') {
        const m = await this.meta(s.businessId, s);
        await this.deliver(s, nx, 'request', m.biz, m.title);
      }
    }
    const after = await this.sync(s.businessId, s.id);
    return {
      signed: true,
      completed: after.signers.every((y) => y.status === 'Signed'),
    };
  }

  async decline(t: string, reason: string, ip: string | null) {
    const x = await this.byToken(t);
    const g = this.gate(x);
    if (g) throw ctErr(CT_ERRORS.STATUS, g);
    if (!reason.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Tell the sender why you’re declining.');
    const s = x.request;
    await this.db.$transaction(async (tx) => {
      await tx.ctSigner.update({
        where: { id: x.id },
        data: {
          status: 'Declined',
          declinedAt: new Date(),
          declineReason: reason.trim().slice(0, 500),
          ip: ip?.slice(0, 64) ?? null,
        },
      });
      await tx.ctSignRequest.update({
        where: { id: s.id },
        data: {
          status: 'Declined',
          note: `Declined by ${x.name}: ${reason.trim()}`.slice(0, 500),
        },
      });
      await this.event(s.id, 'signer.declined', `${x.name}: ${reason.trim()}`, {
        signerId: x.id,
        ip,
        tx,
      });
      await this.unwind(s, 'Declined', tx);
      await this.ctx.audit(
        s.businessId,
        { name: `${x.name} (signer)` },
        'Signature declined',
        'signature',
        s.id,
        `${s.number} · ${reason.trim()}`,
        { tx },
      );
    });
    const cfg = await this.ctx.config(s.businessId);
    if (cfg.notify.failed)
      await this.ctx.notify(
        s.businessId,
        [s.senderId],
        `${s.number} declined`,
        `${x.name}: ${reason.trim()}`,
        '/contracts/signatures',
      );
    return { declined: true };
  }

  // ── scheduled: expiry & reminders ─────────────────────────────────────

  async sweep(rootId: string) {
    const cfg = await this.ctx.config(rootId);
    const live = await this.db.ctSignRequest.findMany({
      where: { businessId: rootId, status: { in: LIVE } },
      include: { signers: { orderBy: { seq: 'asc' } } },
    });
    let expired = 0;
    let reminded = 0;
    for (const s of live) {
      if (s.deadline < new Date()) {
        await this.db.$transaction(async (tx) => {
          await tx.ctSignRequest.update({
            where: { id: s.id },
            data: { status: 'Expired' },
          });
          await this.event(
            s.id,
            'request.expired',
            `Deadline ${iso(s.deadline)} passed`,
            { tx },
          );
          await this.unwind(s, 'Expired', tx);
          await this.ctx.audit(
            rootId,
            'System',
            'Signature request expired',
            'signature',
            s.id,
            `${s.number} · deadline ${iso(s.deadline)}`,
            { tx },
          );
        });
        if (cfg.notify.failed)
          await this.ctx.notify(
            rootId,
            [s.senderId],
            `${s.number} expired`,
            'The signing deadline passed. Resend to give signers a new deadline.',
            '/contracts/signatures',
          );
        expired++;
        continue;
      }
      const every = REMIND_DAYS[s.reminders] ?? 0;
      if (!every) continue;
      const m = await this.meta(rootId, s);
      for (const x of this.turn(s)) {
        const last = x.lastReminded ?? x.sentAt;
        if (!last || ['Delivery Failed', 'Pending'].includes(x.status))
          continue;
        if (
          Date.now() - last.getTime() >= every * 86400000 &&
          (await this.deliver(s, x, 'reminder', m.biz, m.title))
        )
          reminded++;
      }
    }
    return { expired, reminded };
  }
}
