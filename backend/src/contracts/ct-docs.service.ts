import { HttpStatus, Injectable } from '@nestjs/common';
import { EmailService } from '../messaging/channels/email.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CtActor,
  CtContextService,
  Tx,
  ctErr,
  notFound,
} from './ct-context.service';
import { CtFilesService, Stored, Upload } from './ct-files.service';
import { CtApprovalsService } from './ct-approvals.service';
import {
  CT_ERRORS,
  DOC_TYPES,
  LINK_MODULES,
  RETENTIONS,
  SENS,
} from './ct.constants';

export interface DocIn {
  title?: string;
  type?: string;
  description?: string;
  folder?: string;
  ownerId?: string;
  branchId?: string | null;
  linkModule?: string | null;
  linkId?: string | null;
  tags?: string[] | string;
  sensitivity?: string;
  expiresOn?: string | null;
  retention?: string;
  approval?: boolean | string;
}

const ACTIVE_SIG = ['Prepared', 'Sent', 'Partially Signed'];
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
const tagList = (t: string[] | string | undefined) =>
  [
    ...new Set(
      (Array.isArray(t) ? t : (t ?? '').split(','))
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;

/** Document library: uploads, versions, folders, tags, internal sharing, archive/delete with retention and legal hold. */
@Injectable()
export class CtDocsService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly files: CtFilesService,
    private readonly approvals: CtApprovalsService,
    private readonly caps: CapabilitiesService,
    private readonly email: EmailService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async get(a: CtActor, id: string) {
    const d = await this.db.ctDocument.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    if (!d) throw notFound('Document');
    if (d.sensitivity === 'Restricted' && !a.restricted)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — this document is restricted for your role.',
        HttpStatus.FORBIDDEN,
      );
    if (a.branches && d.branchId && !a.branches.includes(d.branchId))
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — this document belongs to another branch.',
        HttpStatus.FORBIDDEN,
      );
    return d;
  }

  private editable(a: CtActor, d: { ownerId: string; createdById: string }) {
    if (a.documents || a.manage) return;
    if (a.upload && (d.ownerId === a.userId || d.createdById === a.userId))
      return;
    this.ctx.need(a, 'documents', 'Editing documents you don’t own');
  }

  /** Same type and two shared significant title words, or the exact same bytes. */
  async duplicate(
    a: CtActor,
    title: string,
    type: string,
    hash?: string | null,
  ) {
    const docs = await this.db.ctDocument.findMany({
      where: { businessId: a.rootId, archivedAt: null },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        linkId: true,
        versions: { select: { sha256: true } },
      },
    });
    const w = words(title);
    const hit = docs.find(
      (d) =>
        (hash && d.versions.some((v) => v.sha256 === hash)) ||
        (d.type === type &&
          words(d.title).filter((x) => w.includes(x)).length >= 2),
    );
    return hit
      ? {
          id: hit.id,
          number: hit.number,
          title: hit.title,
          sameFile: !!hash && hit.versions.some((v) => v.sha256 === hash),
        }
      : null;
  }

  private async validate(a: CtActor, i: DocIn) {
    const cfg = await this.ctx.config(a.rootId);
    const members = await this.ctx.members(a.rootId);
    const group = await this.ctx.branches(a.rootId);
    const sens = SENS.includes(i.sensitivity ?? '')
      ? i.sensitivity!
      : 'Internal';
    if (sens === 'Restricted' && !a.restricted)
      this.ctx.need(a, 'restricted', 'Marking a document Restricted');
    if (i.linkModule && !LINK_MODULES.includes(i.linkModule))
      throw ctErr(CT_ERRORS.INVALID, 'Unknown linked module.');
    if (i.branchId && !group.some((g) => g.id === i.branchId))
      throw ctErr(CT_ERRORS.INVALID, 'Unknown branch.');
    const folder = cfg.folders.list.includes(i.folder ?? '')
      ? i.folder!
      : (cfg.folders.list[0] ?? 'Contracts');
    const ownerId =
      i.ownerId && members.some((m) => m.id === i.ownerId)
        ? i.ownerId
        : a.userId;
    return {
      cfg,
      data: {
        type: DOC_TYPES.includes(i.type ?? '') ? i.type! : 'Other',
        folder,
        description: i.description?.trim() || null,
        ownerId,
        branchId: i.branchId || (a.branches?.[0] ?? null),
        linkModule: i.linkModule || null,
        linkId: i.linkModule ? i.linkId || null : null,
        sensitivity: sens,
        expiresOn: day(i.expiresOn ?? null),
        retention: RETENTIONS.includes(i.retention ?? '')
          ? i.retention!
          : cfg.retention.default,
        tags: tagList(i.tags),
      },
    };
  }

  /** Creates a document (one per file; no file = a metadata-only draft). */
  async create(
    a: CtActor,
    i: DocIn,
    uploads: Upload[],
    tx?: Tx,
    o?: { note?: string; stored?: Stored; status?: string },
  ) {
    if (!a.upload && !a.documents && !a.manage)
      this.ctx.need(a, 'upload', 'Uploading documents');
    const { cfg, data } = await this.validate(a, i);
    if (uploads.length > cfg.files.perUpload)
      throw ctErr(
        CT_ERRORS.INVALID,
        `Up to ${cfg.files.perUpload} files per upload.`,
      );
    uploads.forEach((f) => this.files.check(cfg, f));
    const stored: (Stored | null)[] = o?.stored
      ? [o.stored]
      : uploads.length
        ? []
        : [null];
    for (const f of uploads)
      stored.push(await this.files.store(a.rootId, cfg, f));
    const apr =
      i.approval === true || i.approval === '1' || i.approval === 'true';
    const out: { id: string; number: string; title: string; status: string }[] =
      [];
    for (const s of stored) {
      const title = (
        (stored.length > 1 && s
          ? `${i.title?.trim() || ''} — ${s.fileName}`
          : i.title?.trim()) ||
        s?.fileName ||
        ''
      ).slice(0, 255);
      if (!title) throw ctErr(CT_ERRORS.INVALID, 'Add a title (and a file).');
      const status =
        o?.status ??
        (!s
          ? 'Draft'
          : apr
            ? 'Approval Pending'
            : s.problem
              ? 'Partial'
              : 'Ready');
      const run = async (db: Tx) => {
        const number = await this.ctx.number(a.rootId, 'doc', db);
        const d = await db.ctDocument.create({
          data: {
            businessId: a.rootId,
            number,
            title,
            ...data,
            tags: data.tags,
            status,
            shares: [],
            processing: s?.problem ?? null,
            createdById: a.userId,
            versions: {
              create: {
                version: 1,
                storageKey: s?.storageKey ?? null,
                fileName: s?.fileName ?? null,
                mime: s?.mime ?? null,
                size: s?.size ?? 0,
                sha256: s?.sha256 ?? null,
                text: s?.text ?? null,
                note: (o?.note ?? s?.fileName ?? 'Created').slice(0, 255),
                state: !s ? 'Draft' : apr ? 'Draft' : 'Ready',
                byUserId: a.userId,
              },
            },
          },
        });
        await this.ctx.audit(
          a.rootId,
          a,
          'Document uploaded',
          'document',
          d.id,
          `${number} · ${title} · ${s ? `${s.fileName} · sha256 ${s.sha256.slice(0, 12)}…` : 'no file'} · ${data.sensitivity}`,
          { tx: db },
        );
        if (apr)
          await this.approvals.start(
            a,
            {
              kind: 'Document',
              entityId: d.id,
              type: 'Document approval',
              roles: ['Legal/Compliance'],
              reason: 'Upload marked “requires approval”',
              changes: 'v1',
              label: `${number} · ${title}`,
              link: '/contracts/documents',
            },
            db,
          );
        return d;
      };
      const d = tx ? await run(tx) : await this.db.$transaction(run);
      out.push({
        id: d.id,
        number: d.number,
        title: d.title,
        status: d.status,
      });
    }
    return out;
  }

  async newVersion(a: CtActor, id: string, note: string, f: Upload | null) {
    const d = await this.get(a, id);
    this.editable(a, d);
    if (d.legalHold)
      throw ctErr(
        CT_ERRORS.HOLD,
        `LEGAL_HOLD — ${d.legalHold}. New versions are blocked.`,
      );
    if (d.archivedAt)
      throw ctErr(
        CT_ERRORS.STATUS,
        'Restore the document before adding a version.',
      );
    if (!note.trim()) throw ctErr(CT_ERRORS.INVALID, 'Add a change note.');
    const cur = d.versions[d.versions.length - 1];
    const live = await this.db.ctSignRequest.findFirst({
      where: { businessId: a.rootId, docId: d.id, status: { in: ACTIVE_SIG } },
    });
    if (live)
      throw ctErr(
        CT_ERRORS.CONFLICT,
        `VERSION_CONFLICT — v${cur.version} is out for signature (${live.number}). Void the request first; signed versions can’t be replaced.`,
        HttpStatus.CONFLICT,
      );
    const ct = await this.db.ctContract.findFirst({
      where: { businessId: a.rootId, docId: d.id },
    });
    if (ct && !['Draft'].includes(ct.status))
      throw ctErr(
        CT_ERRORS.STATUS,
        `${ct.number} is ${ct.status} — its document changes through an amendment, not a new version.`,
      );
    const cfg = await this.ctx.config(a.rootId);
    const s = f ? await this.files.store(a.rootId, cfg, f) : null;
    if (!s)
      throw ctErr(CT_ERRORS.INVALID, 'Choose the file for the new version.');
    const nv = cur.version + 1;
    await this.db.$transaction(async (tx) => {
      await tx.ctDocVersion.create({
        data: {
          docId: d.id,
          version: nv,
          storageKey: s.storageKey,
          fileName: s.fileName,
          mime: s.mime,
          size: s.size,
          sha256: s.sha256,
          text: s.text,
          note: note.trim().slice(0, 255),
          state: 'Draft',
          byUserId: a.userId,
        },
      });
      if (!cur.immutable)
        await tx.ctDocVersion.update({
          where: { id: cur.id },
          data: { state: 'Superseded' },
        });
      await tx.ctDocument.update({
        where: { id: d.id },
        data: {
          status: ['Signed', 'Active', 'Approved'].includes(d.status)
            ? d.status
            : s.problem
              ? 'Partial'
              : 'Ready',
          processing: s.problem,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Document version created',
        'document',
        d.id,
        `${d.number} v${nv} · previous versions kept · ${note.trim()}`,
        { tx },
      );
    });
    return { version: nv };
  }

  async move(a: CtActor, ids: string[], folder: string) {
    const cfg = await this.ctx.config(a.rootId);
    if (!cfg.folders.list.includes(folder))
      throw ctErr(CT_ERRORS.INVALID, 'Choose an existing folder.');
    const docs = await Promise.all(ids.map((x) => this.get(a, x)));
    docs.forEach((d) => this.editable(a, d));
    const held = docs.filter((d) => d.legalHold);
    if (held.length)
      throw ctErr(
        CT_ERRORS.HOLD,
        `LEGAL_HOLD — ${held.map((d) => d.number).join(', ')} can’t be moved.`,
      );
    await this.db.ctDocument.updateMany({
      where: { id: { in: docs.map((d) => d.id) } },
      data: { folder },
    });
    for (const d of docs)
      await this.ctx.audit(
        a.rootId,
        a,
        'Document moved',
        'document',
        d.id,
        `${d.number}: ${d.folder} → ${folder}`,
      );
    return { n: docs.length };
  }

  async tag(a: CtActor, ids: string[], tags: string) {
    const add = tagList(tags);
    if (!add.length) throw ctErr(CT_ERRORS.INVALID, 'Add at least one tag.');
    const docs = await Promise.all(ids.map((x) => this.get(a, x)));
    docs.forEach((d) => this.editable(a, d));
    for (const d of docs) {
      await this.db.ctDocument.update({
        where: { id: d.id },
        data: { tags: [...new Set([...((d.tags as string[]) ?? []), ...add])] },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Document tagged',
        'document',
        d.id,
        `${d.number} + ${add.join(', ')}`,
      );
    }
    return { n: docs.length };
  }

  /** Internal sharing only — restricted documents can only go to people who hold contracts.restricted. */
  async share(a: CtActor, id: string, userIds: string[], perm: string) {
    const d = await this.get(a, id);
    this.editable(a, d);
    const members = await this.ctx.members(a.rootId);
    const ids = [...new Set(userIds)].filter((u) =>
      members.some((m) => m.id === u),
    );
    if (d.sensitivity === 'Restricted') {
      for (const u of ids) {
        const m = members.find((x) => x.id === u)!;
        const ok =
          m.role === 'owner' ||
          (
            await this.caps.resolve({
              businessId: m.businessId,
              role: m.role,
              customRoleId: m.customRoleId,
            })
          ).includes(CAPABILITIES.CONTRACTS_RESTRICTED);
        if (!ok)
          throw ctErr(
            CT_ERRORS.FORBIDDEN,
            `PERMISSION_DENIED — ${m.name} can’t see restricted documents.`,
            HttpStatus.FORBIDDEN,
          );
      }
    }
    await this.db.ctDocument.update({
      where: { id: d.id },
      data: { shares: ids },
    });
    const added = ids.filter(
      (u) => !((d.shares as string[]) ?? []).includes(u),
    );
    await this.ctx.notify(
      a.rootId,
      added,
      `Document shared · ${d.title}`,
      `${a.name} shared ${d.number} with you (${perm}).`,
      '/contracts/documents',
      a.userId,
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Document shared internally',
      'document',
      d.id,
      `${d.number} → ${ids.map((u) => members.find((m) => m.id === u)?.name).join(', ') || 'nobody'} · ${perm}`,
    );
    return { n: ids.length };
  }

  async archive(a: CtActor, id: string, reason: string, restore = false) {
    const d = await this.get(a, id);
    this.editable(a, d);
    if (!restore && d.legalHold)
      throw ctErr(
        CT_ERRORS.HOLD,
        `LEGAL_HOLD — ${d.legalHold}. Archive blocked.`,
      );
    if (!restore && !reason.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    await this.db.ctDocument.update({
      where: { id: d.id },
      data: { archivedAt: restore ? null : new Date() },
    });
    if (!restore) await this.approvals.cancelFor(a, d.id, 'document archived');
    await this.ctx.audit(
      a.rootId,
      a,
      restore ? 'Document restored' : 'Document archived',
      'document',
      d.id,
      `${d.number}${reason ? ` · ${reason}` : ''}`,
    );
    return { ok: true };
  }

  async remove(a: CtActor, id: string, reason: string) {
    this.ctx.need(a, 'delete', 'Deleting documents');
    const d = await this.get(a, id);
    if (!reason.trim()) throw ctErr(CT_ERRORS.INVALID, 'Reason required.');
    if (d.legalHold)
      throw ctErr(
        CT_ERRORS.HOLD,
        `LEGAL_HOLD — deletion blocked: ${d.legalHold}.`,
      );
    const cfg = await this.ctx.config(a.rootId);
    if (cfg.retention.deletion === 'Never delete')
      throw ctErr(
        CT_ERRORS.RETENTION,
        'RETENTION_BLOCK — Settings › Retention says documents are never deleted. Archive instead.',
      );
    if (
      ['Signed', 'Active', 'Approved'].includes(d.status) ||
      d.versions.some((v) => v.immutable)
    )
      throw ctErr(
        CT_ERRORS.RETENTION,
        `RETENTION_BLOCK — ${d.number} has locked versions retained for “${d.retention}”. Archive instead.`,
      );
    const [ct, sig, cmp, obl] = await Promise.all([
      this.db.ctContract.findFirst({
        where: { businessId: a.rootId, docId: d.id },
      }),
      this.db.ctSignRequest.findFirst({
        where: { businessId: a.rootId, docId: d.id },
      }),
      this.db.ctCompliance.findFirst({
        where: { businessId: a.rootId, docId: d.id },
      }),
      this.db.ctObligation.findFirst({ where: { evidenceDocId: d.id } }),
    ]);
    const dep =
      ct?.number ??
      sig?.number ??
      cmp?.number ??
      (obl ? 'an obligation’s evidence' : null);
    if (dep)
      throw ctErr(
        CT_ERRORS.RETENTION,
        `Blocked — ${dep} depends on this document. Archive instead.`,
      );
    await this.approvals.cancelFor(a, d.id, 'document deleted');
    await this.db.ctDocument.delete({ where: { id: d.id } });
    for (const v of d.versions) await this.files.remove(v.storageKey);
    await this.ctx.audit(
      a.rootId,
      a,
      'Document deleted',
      'document',
      d.id,
      `${d.number} · ${d.title} · retention OK · no hold · no dependencies · ${reason}`,
    );
    return { ok: true };
  }

  async hold(a: CtActor, id: string, reason: string | null) {
    this.ctx.need(a, 'settings', 'Placing or releasing a legal hold');
    const d = await this.get(a, id);
    if (reason !== null && !reason.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Give the reason for the hold.');
    await this.db.ctDocument.update({
      where: { id: d.id },
      data: { legalHold: reason?.trim().slice(0, 255) ?? null },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      reason ? 'Legal hold placed' : 'Legal hold released',
      'document',
      d.id,
      `${d.number}${reason ? ` · ${reason}` : ''}`,
    );
    return { ok: true };
  }

  async download(a: CtActor, id: string, version?: number) {
    const d = await this.get(a, id);
    if (!d.versions.length) throw notFound('Version');
    const v = version
      ? d.versions.find((x) => x.version === version)
      : d.versions[d.versions.length - 1];
    if (!v) throw notFound('Version');
    if (!v.storageKey)
      throw ctErr(
        CT_ERRORS.FILE,
        `${d.number} v${v.version} has no file — it’s a metadata-only record.`,
      );
    if (d.sensitivity !== 'Public')
      await this.ctx.audit(
        a.rootId,
        a,
        'Document downloaded',
        'document',
        d.id,
        `${d.number} v${v.version} · ${d.sensitivity}`,
      );
    return {
      url: await this.files.url(v.storageKey),
      name: v.fileName,
      ttl: 300,
    };
  }

  async folder(a: CtActor, name: string) {
    if (!a.documents && !a.manage && !a.settings)
      this.ctx.need(a, 'documents', 'Creating folders');
    const n = name.trim().slice(0, 60);
    if (!n) throw ctErr(CT_ERRORS.INVALID, 'Name required.');
    const s = await this.ctx.ensure(a.rootId);
    const cfg = await this.ctx.config(a.rootId);
    if (cfg.folders.list.some((f) => f.toLowerCase() === n.toLowerCase()))
      throw ctErr(CT_ERRORS.INVALID, 'A folder with that name exists.');
    const next = {
      ...cfg,
      folders: { ...cfg.folders, list: [...cfg.folders.list, n] },
    };
    await this.db.$transaction(async (tx) => {
      await tx.ctSettings.update({
        where: { businessId: a.rootId },
        data: {
          config: next,
          version: s.version + 1,
        },
      });
      await tx.ctSettingsVersion.create({
        data: {
          businessId: a.rootId,
          version: s.version + 1,
          config: next,
          changed: ['Folders'],
          byUserId: a.userId,
        },
      });
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Folder created',
      'settings',
      a.rootId,
      n,
    );
    return { ok: true };
  }

  /**
   * Asks someone for a document: staff get an in-app notification; customers and suppliers get an
   * email at the address on their record. Their reply isn't captured automatically — upload what
   * arrives.
   */
  async request(a: CtActor, party: string, what: string, due: string | null) {
    if (!what.trim()) throw ctErr(CT_ERRORS.INVALID, 'Describe the document.');
    const [kind, pid] = party.split(':');
    const p = (await this.ctx.parties(a.rootId)).find(
      (x) => x.kind === kind && x.id === pid,
    );
    if (!p) throw ctErr(CT_ERRORS.INVALID, 'Choose who to ask.');
    const biz = await this.ctx.business(a.rootId);
    const text = `${biz.name} is asking for: ${what.trim()}${due ? ` (needed by ${due})` : ''}.\n\nPlease reply to this email with the document attached.\n\n— ${a.name}`;
    if (p.kind === 'staff') {
      await this.ctx.notify(
        a.rootId,
        [p.id],
        'Document requested',
        `${a.name} needs: ${what.trim()}${due ? ` by ${due}` : ''}. Upload it in Contracts › Documents.`,
        '/contracts/documents',
        a.userId,
      );
    } else {
      if (!p.email)
        throw ctErr(
          CT_ERRORS.INVALID,
          `${p.name} has no email on their ${p.module} record — add one there first.`,
        );
      try {
        await this.email.send({
          to: p.email,
          text,
          templateKey: 'document_request',
          locale: 'en',
          businessId: a.rootId,
        });
      } catch (e) {
        throw ctErr(
          'DELIVERY_FAILED',
          `Email to ${p.email} failed — ${(e as Error).message}. Nothing was sent.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Document requested',
      'document',
      a.rootId,
      `${p.name} (${p.module}) · ${what.trim()}${due ? ` · by ${due}` : ''}`,
    );
    return { to: p.kind === 'staff' ? `${p.name} (in-app)` : p.email };
  }
}
