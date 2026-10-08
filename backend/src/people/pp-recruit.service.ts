import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Upload } from '../contracts/ct-files.service';
import { zoned } from '../field-service/fs-time';
import {
  PpActor,
  PpContextService,
  notFound,
  num,
  ppErr,
} from './pp-context.service';
import { PpBridgeService } from './pp-bridge.service';
import {
  APP_CLOSED,
  APP_T,
  EMP_TYPES,
  PP_ERRORS,
  ROUNDS,
  SOURCES,
  WORK_MODES,
} from './pp.constants';

type Job = Prisma.PpJobGetPayload<object>;
type Cand = Prisma.PpCandidateGetPayload<object>;
type Offer = Prisma.PpOfferGetPayload<object>;

export interface JobIn {
  expectedVersion?: number;
  title?: string;
  department?: string;
  branchId?: string | null;
  workMode?: string;
  employmentType?: string;
  target?: number | string;
  managerUserId?: string | null;
  recruiterUserId?: string | null;
  compMin?: number | string | null;
  compMax?: number | string | null;
  reason?: string;
  budgetRef?: string;
  description?: string;
  targetDays?: number | string;
}
export interface CandIn {
  name?: string;
  email?: string;
  phone?: string;
  jobId?: string;
  source?: string;
  referredBy?: string;
  consent?: string;
  expectedComp?: number | string | null;
  availability?: string;
  force?: boolean | string;
}
export interface IntIn {
  candidateId?: string;
  round?: string;
  date?: string;
  time?: string;
  timezone?: string;
  durationMin?: number | string;
  interviewers?: string[];
  location?: string;
  message?: string;
  force?: boolean | string;
}
export interface OfferIn {
  candidateId?: string;
  employmentType?: string;
  branchId?: string | null;
  startDate?: string;
  comp?: number | string;
  frequency?: string;
  benefits?: string;
  probation?: string;
  conditions?: string;
  expiresInDays?: number | string;
}

const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
const yes = (v: unknown) => v === true || v === 'true' || v === '1';
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'job';
const nowIso = () => new Date().toISOString();

/** Vacancies, candidates, interviews and offers (pp-ui.js recruitment workflows). */
@Injectable()
export class PpRecruitService {
  constructor(
    private readonly ctx: PpContextService,
    private readonly bridge: PpBridgeService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private async job(a: PpActor, id: string) {
    const j = await this.db.ppJob.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!j) throw notFound('Job');
    return j;
  }
  private async cand(a: PpActor, id: string) {
    const c = await this.db.ppCandidate.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!c) throw notFound('Candidate');
    return c;
  }
  private async offer(a: PpActor, id: string) {
    const o = await this.db.ppOffer.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!o) throw notFound('Offer');
    return o;
  }
  private async int(a: PpActor, id: string) {
    const i = await this.db.ppInterview.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!i) throw notFound('Interview');
    return i;
  }
  private hist(c: Cand, t: string, by: string) {
    return [
      ...((c.history as unknown as object[]) ?? []),
      { t, at: nowIso(), by },
    ] as Prisma.InputJsonValue;
  }

  // ── jobs ──────────────────────────────────────────────────────────────

  private async jobData(a: PpActor, i: JobIn, cur?: Job) {
    const title = (i.title ?? cur?.title ?? '').trim();
    if (!title) throw ppErr(PP_ERRORS.INVALID, 'Job title required.');
    const dept = (i.department ?? cur?.department ?? '').trim();
    if (!dept) throw ppErr(PP_ERRORS.INVALID, 'Department required.');
    const group = await this.ctx.branches(a.rootId);
    const branchId =
      i.branchId === undefined ? (cur?.branchId ?? null) : i.branchId || null;
    if (branchId && !group.some((g) => g.id === branchId))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown branch.');
    const members = await this.ctx.members(a.rootId);
    const mgr =
      i.managerUserId === undefined
        ? (cur?.managerUserId ?? null)
        : i.managerUserId || null;
    if (mgr && !members.some((m) => m.id === mgr))
      throw ppErr(PP_ERRORS.INVALID, 'Hiring manager must be active staff.');
    const comp = a.comp || a.salary;
    const cmin =
      comp && i.compMin !== undefined
        ? i.compMin === '' || i.compMin == null
          ? null
          : Number(i.compMin)
        : cur?.compMin != null
          ? num(cur.compMin)
          : null;
    const cmax =
      comp && i.compMax !== undefined
        ? i.compMax === '' || i.compMax == null
          ? null
          : Number(i.compMax)
        : cur?.compMax != null
          ? num(cur.compMax)
          : null;
    if ((cmin != null && !(cmin >= 0)) || (cmax != null && !(cmax >= 0)))
      throw ppErr(PP_ERRORS.INVALID, 'Compensation must be zero or more.');
    if (cmin != null && cmax != null && cmin > cmax)
      throw ppErr(
        PP_ERRORS.INVALID,
        'VALIDATION_ERROR — minimum is above maximum.',
      );
    const target = Math.max(
      1,
      Math.round(Number(i.target ?? cur?.target ?? 1)) || 1,
    );
    const td = Math.max(
      1,
      Math.round(Number(i.targetDays ?? cur?.targetDays ?? 30)) || 30,
    );
    const mode = i.workMode ?? cur?.workMode ?? 'On-site';
    const type = i.employmentType ?? cur?.employmentType ?? 'Full-time';
    if (!WORK_MODES.includes(mode) || !EMP_TYPES.includes(type))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown work mode or employment type.');
    return {
      title: title.slice(0, 160),
      department: dept.slice(0, 60),
      branchId,
      workMode: mode,
      employmentType: type,
      target,
      managerUserId: mgr,
      recruiterUserId:
        i.recruiterUserId === undefined
          ? (cur?.recruiterUserId ?? a.userId)
          : i.recruiterUserId || null,
      compMin: cmin,
      compMax: cmax,
      reason: (i.reason ?? cur?.reason ?? '').slice(0, 255) || null,
      budgetRef:
        (i.budgetRef ?? cur?.budgetRef ?? '').trim().slice(0, 80) || null,
      description: (i.description ?? cur?.description ?? '') || null,
      targetDays: td,
      compChanged:
        !!cur &&
        (cmin !== (cur.compMin != null ? num(cur.compMin) : null) ||
          cmax !== (cur.compMax != null ? num(cur.compMax) : null)),
    };
  }

  async createJob(a: PpActor, i: JobIn) {
    this.ctx.need(a, 'recruit', 'Creating vacancies');
    const { compChanged, ...data } = await this.jobData(a, i);
    void compChanged;
    const j = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'job', tx);
      let slug = slugify(data.title);
      if (await tx.ppJob.findFirst({ where: { businessId: a.rootId, slug } }))
        slug = `${slug}-${number.toLowerCase()}`;
      const r = await tx.ppJob.create({
        data: {
          ...data,
          businessId: a.rootId,
          number,
          status: 'Draft',
          slug,
          createdById: a.userId,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Job created',
        'job',
        r.id,
        `${number} · ${data.title}`,
        { tx },
      );
      return r;
    });
    return { id: j.id, number: j.number };
  }

  async editJob(a: PpActor, id: string, i: JobIn) {
    this.ctx.need(a, 'recruit', 'Editing vacancies');
    const cur = await this.job(a, id);
    if (i.expectedVersion != null && Number(i.expectedVersion) !== cur.version)
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${cur.number} changed since you opened it (now v${cur.version}). Nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    if (['Filled', 'Closed', 'Cancelled'].includes(cur.status))
      throw ppErr(PP_ERRORS.STATUS, `${cur.number} is ${cur.status}.`);
    const { compChanged, ...data } = await this.jobData(a, i, cur);
    const reapprove =
      compChanged &&
      ['Open', 'Published'].includes(cur.status) &&
      this.needApproval(await this.ctx.config(a.rootId));
    await this.db.$transaction(async (tx) => {
      await tx.ppJob.update({
        where: { id: cur.id },
        data: {
          ...data,
          version: { increment: 1 },
          ...(reapprove
            ? { status: 'Awaiting Approval', publishedAt: null }
            : {}),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Job edited',
        'job',
        cur.id,
        `${cur.number}${reapprove ? ' · compensation changed → back to Awaiting Approval (unpublished)' : ''}`,
        { tx },
      );
    });
    return { reapprove };
  }

  private needApproval(cfg: { recruiting: { jobApprovalRequired: boolean } }) {
    return cfg.recruiting.jobApprovalRequired;
  }

  async jobAction(a: PpActor, id: string, act: string, reason = '') {
    const j = await this.job(a, id);
    const cfg = await this.ctx.config(a.rootId);
    const mv = async (
      to: string,
      label: string,
      extra: Prisma.PpJobUncheckedUpdateInput = {},
    ) => {
      await this.db.$transaction(async (tx) => {
        await tx.ppJob.update({
          where: { id: j.id },
          data: { status: to, version: { increment: 1 }, ...extra },
        });
        await this.ctx.audit(
          a.rootId,
          a,
          label,
          'job',
          j.id,
          `${j.number} · ${j.status} → ${to}${reason ? ` · ${reason}` : ''}`,
          { tx },
        );
      });
      return { status: to };
    };
    const need = (from: string[]) => {
      if (!from.includes(j.status))
        throw ppErr(
          PP_ERRORS.STATUS,
          `INVALID_STATUS_TRANSITION — ${j.number} is ${j.status}.`,
        );
    };
    switch (act) {
      case 'submit': {
        this.ctx.need(a, 'recruit', 'Submitting vacancies');
        need(['Draft']);
        if (!j.budgetRef)
          throw ppErr(
            PP_ERRORS.APPROVAL,
            'APPROVAL_REQUIRED — add a Finance budget approval reference first.',
          );
        if (!this.needApproval(cfg))
          return mv('Open', 'Job opened (approval not required)', {
            openedAt: new Date(),
          });
        const r = await mv('Awaiting Approval', 'Job submitted for approval');
        await this.ctx.notify(
          a.rootId,
          await this.ctx.ownerIds(a.rootId),
          `Vacancy awaiting approval: ${j.title}`,
          `${j.number} · submitted by ${a.name}`,
          '/people/jobs',
          a.userId,
        );
        return r;
      }
      case 'approve':
        this.ctx.need(a, 'jobApprove', 'Approving vacancies');
        need(['Awaiting Approval']);
        if (j.createdById === a.userId && !a.owner)
          throw ppErr(
            PP_ERRORS.SOD,
            'SEPARATION_OF_DUTIES — you created this vacancy, so someone else must approve it.',
          );
        return mv('Open', 'Job approved', {
          openedAt: j.openedAt ?? new Date(),
        });
      case 'publish':
        this.ctx.need(a, 'recruit', 'Publishing vacancies');
        need(['Open']);
        if (!cfg.recruiting.careersEnabled)
          throw ppErr(
            PP_ERRORS.NOT_CONFIGURED,
            'NOT_CONFIGURED — turn on the public careers page in People settings › Recruiting & careers first.',
          );
        return mv('Published', 'Job published', {
          publishedAt: new Date(),
          compPublic: reason === 'showcomp',
        });
      case 'unpublish':
        this.ctx.need(a, 'recruit', 'Unpublishing vacancies');
        need(['Published']);
        return mv('Open', 'Job unpublished', { publishedAt: null });
      case 'pause':
        this.ctx.need(a, 'recruit', 'Pausing vacancies');
        need(['Open', 'Published']);
        return mv('On Hold', 'Job paused', { publishedAt: null });
      case 'resume':
        this.ctx.need(a, 'recruit', 'Resuming vacancies');
        need(['On Hold']);
        return mv('Open', 'Job resumed');
      case 'close':
        this.ctx.need(a, 'recruit', 'Closing vacancies');
        need(['Open', 'Published', 'On Hold', 'Draft', 'Awaiting Approval']);
        if (!reason.trim())
          throw ppErr(PP_ERRORS.INVALID, 'Close reason required.');
        return mv(
          ['Draft', 'Awaiting Approval'].includes(j.status)
            ? 'Cancelled'
            : 'Closed',
          'Job closed',
          { closedAt: new Date(), publishedAt: null },
        );
      case 'fill':
        this.ctx.need(a, 'recruit', 'Marking vacancies filled');
        need(['Open', 'Published', 'On Hold']);
        return mv('Filled', 'Job filled', {
          closedAt: new Date(),
          publishedAt: null,
        });
      case 'duplicate': {
        this.ctx.need(a, 'recruit', 'Duplicating vacancies');
        const r = await this.createJob(a, {
          title: `${j.title} (copy)`,
          department: j.department,
          branchId: j.branchId,
          workMode: j.workMode,
          employmentType: j.employmentType,
          target: j.target,
          managerUserId: j.managerUserId,
          compMin: j.compMin != null ? num(j.compMin) : null,
          compMax: j.compMax != null ? num(j.compMax) : null,
          reason: j.reason ?? '',
          budgetRef: j.budgetRef ?? '',
          description: j.description ?? '',
          targetDays: j.targetDays,
        });
        return { status: 'Draft', number: r.number };
      }
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    }
  }

  // ── candidates ────────────────────────────────────────────────────────

  async dupCheck(
    rootId: string,
    email: string,
    phone: string | undefined,
    name: string,
  ) {
    const L = await this.db.ppCandidate.findMany({
      where: { businessId: rootId },
      select: {
        id: true,
        number: true,
        name: true,
        email: true,
        phone: true,
        stage: true,
      },
    });
    const e = email.trim().toLowerCase();
    const p = (phone ?? '').replace(/\D/g, '');
    return (
      L.find(
        (c) =>
          c.email.toLowerCase() === e ||
          (p.length >= 7 &&
            (c.phone ?? '').replace(/\D/g, '').endsWith(p.slice(-7)) &&
            c.name.toLowerCase() === name.trim().toLowerCase()),
      ) ?? null
    );
  }

  async createCand(
    a: PpActor | null,
    rootId: string,
    i: CandIn,
    resume: Upload | null,
    viaCareers = false,
  ) {
    if (a) this.ctx.need(a, 'recruit', 'Adding candidates');
    const name = (i.name ?? '').trim();
    const email = (i.email ?? '').trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw ppErr(PP_ERRORS.INVALID, 'Name and a valid email are required.');
    if (!['Given', 'Pending'].includes(i.consent ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Record the privacy consent state.');
    const job = await this.db.ppJob.findFirst({
      where: { businessId: rootId, id: i.jobId ?? '' },
    });
    if (!job) throw ppErr(PP_ERRORS.INVALID, 'Pick the job they applied for.');
    if (!['Open', 'Published'].includes(job.status))
      throw ppErr(
        PP_ERRORS.STATUS,
        `${job.number} is ${job.status} — it isn’t taking candidates.`,
      );
    const dup = await this.dupCheck(rootId, email, i.phone, name);
    if (dup && !yes(i.force)) {
      if (viaCareers)
        throw ppErr(
          PP_ERRORS.DUPLICATE,
          'You’ve already applied with this email — we have your application.',
          HttpStatus.CONFLICT,
        );
      throw ppErr(
        PP_ERRORS.DUPLICATE,
        `POSSIBLE_DUPLICATE — ${dup.number} ${dup.name} (${dup.stage}). Review before adding — records are never auto-merged.`,
        HttpStatus.CONFLICT,
      );
    }
    const src =
      (i.source ?? '').trim() || (viaCareers ? 'Careers page' : 'Other');
    if (!viaCareers && !SOURCES.includes(src))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown source.');
    const c = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(rootId, 'cand', tx);
      const r = await tx.ppCandidate.create({
        data: {
          businessId: rootId,
          number,
          jobId: job.id,
          name: name.slice(0, 160),
          email: email.toLowerCase().slice(0, 190),
          phone: (i.phone ?? '').trim().slice(0, 40) || null,
          source: src.slice(0, 40),
          referredBy: (i.referredBy ?? '').trim().slice(0, 160) || null,
          stage: 'New',
          ownerUserId: a?.userId ?? job.recruiterUserId,
          expectedComp:
            i.expectedComp === '' || i.expectedComp == null
              ? null
              : Number(i.expectedComp),
          availability: (i.availability ?? '').trim().slice(0, 80) || null,
          consent: i.consent!,
          history: [
            {
              t: viaCareers
                ? 'Applied via careers page'
                : `Added by ${a!.name}${dup ? ` (duplicate warning reviewed: ${dup.number})` : ''}`,
              at: nowIso(),
            },
          ],
        },
      });
      await this.ctx.audit(
        rootId,
        a ?? { name: 'Careers page' },
        'Candidate created',
        'candidate',
        r.id,
        `${number} · ${name} · ${job.number} · ${src}`,
        { tx },
      );
      return r;
    });
    if (resume) {
      const doc = await this.bridge.fileDoc(
        a ?? (await this.systemActor(rootId)),
        {
          title: `Resume · ${name}`,
          type: 'Employment Document',
          linkId: c.id,
          file: resume,
        },
      );
      await this.db.ppCandidate.update({
        where: { id: c.id },
        data: {
          resumeKey: doc.id,
          resumeName: resume.originalname.slice(0, 255),
        },
      });
    }
    if (viaCareers && job.recruiterUserId)
      await this.ctx.notify(
        rootId,
        [job.recruiterUserId, job.managerUserId],
        `New applicant: ${name}`,
        `${job.title} · via careers page`,
        '/people/applicants',
      );
    return { id: c.id, number: c.number };
  }

  /** Public careers uploads are filed by the job's recruiter (or the owner) — never anonymous in Contracts. */
  private async systemActor(rootId: string): Promise<PpActor> {
    const owner = await this.db.businessUser.findFirst({
      where: { businessId: rootId, role: 'owner', active: true },
      include: { user: { select: { name: true } } },
    });
    if (!owner)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        'This business has no active owner to file applications under.',
      );
    const user = {
      sub: owner.userId,
      businessId: rootId,
      role: owner.role,
    } as PpActor['user'];
    return this.ctx.actor(user);
  }

  async moveStage(
    a: PpActor,
    id: string,
    to: string,
    reason = '',
    expectedVersion?: number,
  ) {
    this.ctx.need(a, 'recruit', 'Moving candidates');
    const c = await this.cand(a, id);
    if (expectedVersion != null && Number(expectedVersion) !== c.version)
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${c.number} changed since you opened it (now v${c.version}). Nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    if (!(APP_T[c.stage] ?? []).includes(to))
      throw ppErr(
        PP_ERRORS.STAGE,
        `INVALID_STAGE_TRANSITION — ${c.stage} → ${to} isn’t allowed.`,
      );
    if (to === 'Hired')
      throw ppErr(
        PP_ERRORS.STAGE,
        'Use “Hire / convert to Staff” — hiring creates the Staff record.',
      );
    if (['Rejected', 'Withdrawn'].includes(to) && !reason.trim())
      throw ppErr(PP_ERRORS.INVALID, 'A reason is required.');
    await this.db.$transaction(async (tx) => {
      await tx.ppCandidate.update({
        where: { id: c.id },
        data: {
          stage: to,
          version: { increment: 1 },
          history: this.hist(
            c,
            `Stage ${c.stage} → ${to}${reason ? ` — ${reason}` : ''}`,
            a.name,
          ),
          ...(['Rejected', 'Withdrawn'].includes(to)
            ? { decidedAt: new Date(), rejectReason: reason.slice(0, 500) }
            : {}),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Candidate stage changed',
        'candidate',
        c.id,
        `${c.number} ${c.stage} → ${to}${reason ? ` · ${reason}` : ''}`,
        { tx },
      );
    });
    return { stage: to };
  }

  async reject(
    a: PpActor,
    id: string,
    reason: string,
    note: string,
    message: boolean,
  ) {
    if (!note.trim()) throw ppErr(PP_ERRORS.INVALID, 'Add detail.');
    const c = await this.cand(a, id);
    await this.moveStage(a, id, 'Rejected', `${reason} — ${note}`);
    let sent = null as null | { ok: boolean; error: string | null };
    if (message) {
      const biz = await this.ctx.business(a.rootId);
      const job = await this.db.ppJob.findFirst({ where: { id: c.jobId } });
      sent = await this.bridge.mail(
        a.rootId,
        c.email,
        `Dear ${c.name},\n\nThank you for your interest in the ${job?.title ?? ''} role at ${biz.name} and for the time you spent with us. After careful consideration we won’t be moving forward with your application this time.\n\nWe wish you every success.\n\n${biz.name}`,
        'application_update',
      );
      await this.logContact(
        a,
        c.id,
        sent.ok
          ? 'Rejection email sent'
          : `Rejection email failed — ${sent.error}`,
      );
    }
    return { sent };
  }

  private async logContact(a: PpActor, candId: string, t: string) {
    const c = await this.db.ppCandidate.findUniqueOrThrow({
      where: { id: candId },
    });
    await this.db.ppCandidate.update({
      where: { id: c.id },
      data: { history: this.hist(c, t, a.name) },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      t.slice(0, 80),
      'candidate',
      c.id,
      `${c.number} · ${t}`,
    );
  }

  async message(
    a: PpActor,
    id: string,
    kind: 'message' | 'document',
    text: string,
  ) {
    this.ctx.need(a, 'recruit', 'Messaging candidates');
    const c = await this.cand(a, id);
    if (!text.trim()) throw ppErr(PP_ERRORS.INVALID, 'Write the message.');
    const biz = await this.ctx.business(a.rootId);
    const body = `${text.trim()}\n\n— ${a.name}, ${biz.name}${kind === 'document' ? '\n\nPlease reply to this email with the requested document attached.' : ''}`;
    const sent = await this.bridge.mail(
      a.rootId,
      c.email,
      body,
      kind === 'document' ? 'document_request' : 'candidate_message',
    );
    await this.logContact(
      a,
      c.id,
      sent.ok
        ? `${kind === 'document' ? 'Document request' : 'Message'} emailed`
        : `${kind === 'document' ? 'Document request' : 'Message'} failed — ${sent.error}`,
    );
    if (!sent.ok)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        `Email couldn’t be sent (${sent.error}). Nothing was delivered — logged on the candidate.`,
        HttpStatus.BAD_GATEWAY,
      );
    return { sent: true };
  }

  async uploadResume(a: PpActor, id: string, f: Upload) {
    this.ctx.need(a, 'recruit', 'Uploading resumes');
    const c = await this.cand(a, id);
    const doc = await this.bridge.fileDoc(a, {
      title: `Resume · ${c.name}`,
      type: 'Employment Document',
      linkId: c.id,
      file: f,
    });
    await this.db.ppCandidate.update({
      where: { id: c.id },
      data: {
        resumeKey: doc.id,
        resumeName: f.originalname.slice(0, 255),
        history: this.hist(c, `Resume filed (${doc.number})`, a.name),
      },
    });
    return { number: doc.number };
  }

  async resumeLink(a: PpActor, id: string) {
    if (!a.recruit && !a.interview)
      this.ctx.need(a, 'recruit', 'Opening resumes');
    const c = await this.cand(a, id);
    if (!c.resumeKey)
      throw ppErr(
        PP_ERRORS.NOT_FOUND,
        'No resume on file.',
        HttpStatus.NOT_FOUND,
      );
    return this.bridge.docLink(a, c.resumeKey);
  }

  // ── interviews ────────────────────────────────────────────────────────

  async schedule(a: PpActor, id: string | null, i: IntIn) {
    this.ctx.need(a, 'interview', 'Scheduling interviews');
    const cur = id ? await this.int(a, id) : null;
    const c = await this.cand(a, cur?.candidateId ?? i.candidateId ?? '');
    if (APP_CLOSED.includes(c.stage))
      throw ppErr(PP_ERRORS.STATUS, `${c.name} is ${c.stage}.`);
    const ivs = [...new Set(i.interviewers ?? [])];
    if (!ivs.length)
      throw ppErr(PP_ERRORS.INVALID, 'Pick at least one interviewer.');
    const members = await this.ctx.members(a.rootId);
    if (ivs.some((v) => !members.some((m) => m.id === v)))
      throw ppErr(PP_ERRORS.INVALID, 'Interviewers must be active staff.');
    const biz = await this.ctx.business(a.rootId);
    const tz = (i.timezone ?? '').trim() || biz.timezone || 'UTC';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(i.date ?? '') ||
      !/^\d{1,2}:\d{2}$/.test(i.time ?? '')
    )
      throw ppErr(PP_ERRORS.INVALID, 'Pick a date and time.');
    const [h, mi] = i.time!.split(':').map(Number);
    let starts: Date;
    try {
      starts = zoned(i.date!, h + mi / 60, tz);
    } catch {
      throw ppErr(PP_ERRORS.INVALID, 'Unknown timezone.');
    }
    if (starts.getTime() < Date.now() - 5 * 60000)
      throw ppErr(PP_ERRORS.INVALID, 'That time is in the past.');
    const dur = Math.max(
      10,
      Math.min(480, Math.round(Number(i.durationMin) || 45)),
    );
    const end = new Date(starts.getTime() + dur * 60000);
    if (!yes(i.force)) {
      const others = await this.db.ppInterview.findMany({
        where: {
          businessId: a.rootId,
          status: 'Scheduled',
          startsAt: { lt: end, gt: new Date(starts.getTime() - 8 * 3600000) },
          ...(cur ? { id: { not: cur.id } } : {}),
        },
      });
      const clash = others.find(
        (o) =>
          (o.interviewers as unknown as string[]).some((x) =>
            ivs.includes(x),
          ) &&
          o.startsAt < end &&
          new Date(o.startsAt.getTime() + o.durationMin * 60000) > starts,
      );
      const group = await this.ctx.branches(a.rootId);
      const k = i.date!;
      const lv = await this.db.timeOff.findFirst({
        where: {
          businessId: { in: group.map((g) => g.id) },
          status: 'Approved',
          staffUser: { userId: { in: ivs } },
          startsAt: { lte: new Date(`${k}T23:59:59Z`) },
          endsAt: { gte: new Date(`${k}T00:00:00Z`) },
        },
        include: {
          staffUser: { include: { user: { select: { name: true } } } },
        },
      });
      if (clash || lv)
        throw ppErr(
          'SCHEDULE_WARNING',
          `⚠ ${clash ? `Interviewer conflict with ${clash.number}` : `${lv!.staffUser.user.name} is on approved leave that day`}. Submit again to schedule anyway.`,
          HttpStatus.CONFLICT,
        );
    }
    const round = ROUNDS.includes(i.round ?? '')
      ? i.round!
      : (cur?.round ?? ROUNDS[0]);
    const data = {
      round,
      startsAt: starts,
      durationMin: dur,
      timezone: tz.slice(0, 60),
      location: (i.location ?? '').trim().slice(0, 160) || 'To be confirmed',
      interviewers: ivs,
      status: 'Scheduled',
      feedbackDue: new Date(end.getTime() + 24 * 3600000),
      message: i.message ?? null,
    };
    const r = await this.db.$transaction(async (tx) => {
      if (cur) {
        await tx.ppInterview.update({ where: { id: cur.id }, data });
        await this.ctx.audit(
          a.rootId,
          a,
          'Interview rescheduled',
          'interview',
          cur.id,
          `${cur.number} → ${i.date} ${i.time} ${tz}`,
          { tx },
        );
        return { id: cur.id, number: cur.number };
      }
      const number = await this.ctx.number(a.rootId, 'int', tx);
      const x = await tx.ppInterview.create({
        data: {
          ...data,
          businessId: a.rootId,
          number,
          candidateId: c.id,
          jobId: c.jobId,
          scorecards: {},
        },
      });
      if (['New', 'Screening', 'Shortlisted'].includes(c.stage))
        await tx.ppCandidate.update({
          where: { id: c.id },
          data: {
            stage: 'Interview',
            version: { increment: 1 },
            history: this.hist(
              c,
              `Stage ${c.stage} → Interview (interview scheduled)`,
              a.name,
            ),
          },
        });
      await this.ctx.audit(
        a.rootId,
        a,
        'Interview scheduled',
        'interview',
        x.id,
        `${number} · ${c.number} ${c.name} · ${i.date} ${i.time} ${tz}`,
        { tx },
      );
      return { id: x.id, number };
    });
    await this.ctx.notify(
      a.rootId,
      ivs,
      `Interview ${cur ? 'rescheduled' : 'scheduled'}: ${c.name}`,
      `${round} · ${i.date} ${i.time} (${tz}) · ${data.location}`,
      '/people/interviews',
      a.userId,
    );
    const sent = await this.confirmMail(a, r.id);
    return { ...r, sent };
  }

  async confirmMail(a: PpActor, id: string) {
    const i = await this.int(a, id);
    const c = await this.db.ppCandidate.findUniqueOrThrow({
      where: { id: i.candidateId },
    });
    const biz = await this.ctx.business(a.rootId);
    const when = i.startsAt.toLocaleString('en-GB', {
      timeZone: i.timezone,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const sent = await this.bridge.mail(
      a.rootId,
      c.email,
      `Dear ${c.name},\n\nYour ${i.round.toLowerCase()} with ${biz.name} is confirmed for ${when} (${i.timezone}), ${i.durationMin} minutes.\nWhere: ${i.location}\n${i.message ? `\n${i.message}\n` : ''}\nIf you need to reschedule, just reply to this email.\n\n${biz.name}`,
      'interview_confirmation',
    );
    await this.logContact(
      a,
      c.id,
      sent.ok
        ? `Interview confirmation emailed (${i.number})`
        : `Interview confirmation failed — ${sent.error}`,
    );
    return sent;
  }

  async intAction(a: PpActor, id: string, act: string, reason = '') {
    this.ctx.need(a, 'interview', 'Updating interviews');
    const i = await this.int(a, id);
    const to = {
      cancel: 'Cancelled',
      complete: 'Completed',
      noshow: 'No-show',
    }[act];
    if (!to) throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    if (i.status !== 'Scheduled')
      throw ppErr(PP_ERRORS.STATUS, `${i.number} is ${i.status}.`);
    if (act === 'cancel' && !reason.trim())
      throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
    if (act === 'complete' && i.startsAt > new Date())
      throw ppErr(PP_ERRORS.STATUS, 'This interview hasn’t started yet.');
    await this.db.$transaction(async (tx) => {
      await tx.ppInterview.update({
        where: { id: i.id },
        data: {
          status: to,
          ...(act === 'complete'
            ? { feedbackDue: new Date(Date.now() + 24 * 3600000) }
            : {}),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        `Interview ${to.toLowerCase()}`,
        'interview',
        i.id,
        `${i.number}${reason ? ` · ${reason}` : ''}`,
        { tx },
      );
    });
    if (act === 'complete')
      await this.ctx.notify(
        a.rootId,
        (i.interviewers as unknown as string[]).filter(
          (v) => !(i.scorecards as Record<string, unknown>)[v],
        ),
        'Interview feedback due',
        `${i.number} · submit your scorecard within 24 hours`,
        '/people/interviews',
        a.userId,
      );
    return { status: to };
  }

  async scorecard(
    a: PpActor,
    id: string,
    iv: string,
    i: { r?: (number | string)[]; rec?: string; note?: string; why?: string },
  ) {
    const x = await this.int(a, id);
    if (iv !== a.userId && !a.owner)
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — you can only submit your own scorecard.',
        HttpStatus.FORBIDDEN,
      );
    if (!(x.interviewers as unknown as string[]).includes(iv))
      throw ppErr(
        PP_ERRORS.INVALID,
        'That person isn’t on this interview panel.',
      );
    if (x.status !== 'Completed')
      throw ppErr(PP_ERRORS.STATUS, 'Mark the interview completed first.');
    const cfg = await this.ctx.config(a.rootId);
    const r = (i.r ?? []).map(Number);
    if (
      r.length !== cfg.recruiting.competencies.length ||
      r.some((v) => !(v >= 1 && v <= 5)) ||
      !i.rec ||
      !(i.note ?? '').trim()
    )
      throw ppErr(
        PP_ERRORS.INVALID,
        'All ratings, a recommendation and evidence are required — nothing is inferred.',
      );
    if (!['Strong hire', 'Hire', 'No hire', 'Strong no hire'].includes(i.rec))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown recommendation.');
    const sc =
      (x.scorecards as unknown as Record<
        string,
        { ver: number; hist?: unknown[] }
      >) ?? {};
    const prev = sc[iv];
    if (prev && !(i.why ?? '').trim())
      throw ppErr(PP_ERRORS.INVALID, 'Amendments need a reason.');
    const next = {
      ...sc,
      [iv]: {
        r,
        rec: i.rec,
        note: i.note!.trim().slice(0, 2000),
        ver: prev ? prev.ver + 1 : 1,
        at: nowIso(),
        by: a.name,
        ...(prev
          ? {
              hist: [
                ...(prev.hist ?? []),
                { ...prev, hist: undefined, why: i.why },
              ],
            }
          : {}),
      },
    };
    await this.db.$transaction(async (tx) => {
      await tx.ppInterview.update({
        where: { id: x.id },
        data: { scorecards: next as Prisma.InputJsonValue },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        prev ? 'Interview feedback amended' : 'Interview feedback submitted',
        'interview',
        x.id,
        `${x.number} · v${next[iv].ver}${prev ? ` · ${i.why}` : ''}`,
        { tx },
      );
    });
    return { ver: next[iv].ver };
  }

  // ── offers ────────────────────────────────────────────────────────────

  async createOffer(a: PpActor, i: OfferIn) {
    this.ctx.need(a, 'recruit', 'Creating offers');
    const c = await this.cand(a, i.candidateId ?? '');
    if (!['Interview', 'Final Interview', 'Offer'].includes(c.stage))
      throw ppErr(
        PP_ERRORS.STATUS,
        `${c.name} is at ${c.stage} — offers are made after an interview.`,
      );
    if (
      await this.db.ppOffer.findFirst({
        where: {
          candidateId: c.id,
          status: { notIn: ['Declined', 'Expired', 'Withdrawn'] },
        },
      })
    )
      throw ppErr(
        PP_ERRORS.DUPLICATE,
        `${c.name} already has an open offer — revise it instead.`,
      );
    const job = await this.db.ppJob.findFirstOrThrow({
      where: { id: c.jobId },
    });
    const d = await this.offerData(a, i, job);
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'offer', tx);
      const o = await tx.ppOffer.create({
        data: {
          ...d.data,
          businessId: a.rootId,
          number,
          candidateId: c.id,
          jobId: job.id,
          status: 'Draft',
          version: 1,
          versions: [{ ver: 1, comp: d.data.comp, st: 'Draft', at: nowIso() }],
          createdById: a.userId,
        },
      });
      if (c.stage !== 'Offer')
        await tx.ppCandidate.update({
          where: { id: c.id },
          data: {
            stage: 'Offer',
            version: { increment: 1 },
            history: this.hist(
              c,
              `Stage ${c.stage} → Offer (${number} drafted)`,
              a.name,
            ),
          },
        });
      await this.ctx.audit(
        a.rootId,
        a,
        'Offer drafted',
        'offer',
        o.id,
        `${number} · ${c.name}${d.over ? ' · above vacancy range' : ''}`,
        { tx },
      );
      return o;
    });
    return { id: r.id, number: r.number, over: d.over };
  }

  private async offerData(a: PpActor, i: OfferIn, job: Job, cur?: Offer) {
    const group = await this.ctx.branches(a.rootId);
    const comp = Number(i.comp ?? (cur ? num(cur.comp) : NaN));
    if (!(comp > 0)) throw ppErr(PP_ERRORS.INVALID, 'Enter compensation.');
    const freq = i.frequency ?? cur?.frequency ?? 'Monthly';
    if (!['Monthly', 'Hourly'].includes(freq))
      throw ppErr(
        PP_ERRORS.INVALID,
        'Pay frequency must be Monthly or Hourly.',
      );
    const start = day(i.startDate) ?? cur?.startDate;
    if (!start) throw ppErr(PP_ERRORS.INVALID, 'Pick a start date.');
    const type = i.employmentType ?? cur?.employmentType ?? job.employmentType;
    if (!EMP_TYPES.includes(type))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown employment type.');
    const branchId =
      i.branchId === undefined
        ? (cur?.branchId ?? job.branchId)
        : i.branchId || null;
    if (branchId && !group.some((g) => g.id === branchId))
      throw ppErr(PP_ERRORS.INVALID, 'Unknown branch.');
    const days = Math.max(
      1,
      Math.min(60, Math.round(Number(i.expiresInDays ?? 7)) || 7),
    );
    const over =
      freq === 'Monthly' && job.compMax != null && comp > num(job.compMax);
    return {
      over,
      data: {
        branchId,
        employmentType: type,
        startDate: start,
        comp,
        frequency: freq,
        probation: (i.probation ?? cur?.probation ?? 'None').slice(0, 20),
        benefits: (i.benefits ?? cur?.benefits ?? '').slice(0, 255) || null,
        conditions:
          (i.conditions ?? cur?.conditions ?? '').slice(0, 255) || null,
        expiresOn:
          cur && i.expiresInDays === undefined
            ? cur.expiresOn
            : new Date(Date.now() + days * 86400000),
      },
    };
  }

  async reviseOffer(
    a: PpActor,
    id: string,
    i: OfferIn & { why?: string; expectedVersion?: number },
  ) {
    this.ctx.need(a, 'recruit', 'Revising offers');
    const o = await this.offer(a, id);
    if (i.expectedVersion != null && Number(i.expectedVersion) !== o.version)
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${o.number} is now v${o.version}. Nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    if (
      ![
        'Draft',
        'Revised',
        'Approved',
        'Document Generated',
        'Sent',
        'Viewed',
        'Declined',
        'Expired',
      ].includes(o.status)
    )
      throw ppErr(PP_ERRORS.STATUS, `${o.number} is ${o.status}.`);
    if (!(i.why ?? '').trim())
      throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
    const job = await this.db.ppJob.findFirstOrThrow({
      where: { id: o.jobId },
    });
    const d = await this.offerData(a, i, job, o);
    const reap = o.approvedComp != null && d.data.comp !== num(o.approvedComp);
    const st =
      reap || o.approvedComp == null
        ? o.status === 'Draft'
          ? 'Draft'
          : reap
            ? 'Approval Required'
            : 'Revised'
        : 'Approved';
    if (o.signRequestId && ['Sent', 'Viewed'].includes(o.status))
      await this.bridge.voidSign(
        a,
        o.signRequestId,
        `Offer revised to v${o.version + 1}`,
      );
    await this.db.$transaction(async (tx) => {
      await tx.ppOffer.update({
        where: { id: o.id },
        data: {
          ...d.data,
          version: { increment: 1 },
          status: st,
          ...(reap ? { approvedComp: null, approvedById: null } : {}),
          docId: null,
          signRequestId: null,
          declineReason: null,
          versions: [
            ...((o.versions as unknown as object[]) ?? []),
            {
              ver: o.version + 1,
              comp: d.data.comp,
              st,
              at: nowIso(),
              why: i.why,
            },
          ] as Prisma.InputJsonValue,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Offer revised',
        'offer',
        o.id,
        `${o.number} → v${o.version + 1}${reap ? ' · compensation changed after approval → re-approval required' : ''} · ${i.why}`,
        { tx },
      );
    });
    if (st === 'Approval Required') await this.notifyApprover(a, o.number);
    return { status: st, version: o.version + 1, reap };
  }

  private async notifyApprover(a: PpActor, number: string) {
    const cfg = await this.ctx.config(a.rootId);
    await this.ctx.notify(
      a.rootId,
      cfg.recruiting.offerApproverUserId
        ? [cfg.recruiting.offerApproverUserId]
        : await this.ctx.ownerIds(a.rootId),
      `Offer awaiting approval: ${number}`,
      `Submitted by ${a.name}`,
      '/people/offers',
      a.userId,
    );
  }

  async offerAction(a: PpActor, id: string, act: string, reason = '') {
    const o = await this.offer(a, id);
    const c = await this.db.ppCandidate.findUniqueOrThrow({
      where: { id: o.candidateId },
    });
    const mv = async (
      to: string,
      label: string,
      extra: Prisma.PpOfferUncheckedUpdateInput = {},
    ) => {
      await this.db.$transaction(async (tx) => {
        await tx.ppOffer.update({
          where: { id: o.id },
          data: { status: to, ...extra },
        });
        await this.ctx.audit(
          a.rootId,
          a,
          label,
          'offer',
          o.id,
          `${o.number} · ${o.status} → ${to}${reason ? ` · ${reason}` : ''}`,
          { tx },
        );
      });
      return { status: to };
    };
    const need = (from: string[]) => {
      if (!from.includes(o.status))
        throw ppErr(
          PP_ERRORS.STATUS,
          `INVALID_STATUS_TRANSITION — ${o.number} is ${o.status}.`,
        );
    };
    switch (act) {
      case 'submit': {
        this.ctx.need(a, 'recruit', 'Submitting offers');
        need(['Draft', 'Revised']);
        const r = await mv('Approval Required', 'Offer submitted for approval');
        await this.notifyApprover(a, o.number);
        return r;
      }
      case 'approve': {
        this.ctx.need(a, 'offerApprove', 'Approving offers');
        need(['Approval Required']);
        const cfg = await this.ctx.config(a.rootId);
        if (
          cfg.recruiting.offerApproverUserId &&
          cfg.recruiting.offerApproverUserId !== a.userId &&
          !a.owner
        )
          throw ppErr(
            PP_ERRORS.FORBIDDEN,
            'PERMISSION_DENIED — another person is the configured offer approver.',
            HttpStatus.FORBIDDEN,
          );
        if (o.createdById === a.userId && !a.owner)
          throw ppErr(
            PP_ERRORS.SOD,
            'SEPARATION_OF_DUTIES — you drafted this offer, so someone else must approve it.',
          );
        return mv('Approved', 'Offer approved', {
          approvedComp: o.comp,
          approvedById: a.userId,
          versions: [
            ...((o.versions as unknown as object[]) ?? []),
            {
              ver: o.version,
              comp: num(o.comp),
              st: 'Approved',
              at: nowIso(),
              by: a.name,
            },
          ] as Prisma.InputJsonValue,
        });
      }
      case 'rejectApproval':
        this.ctx.need(a, 'offerApprove', 'Rejecting offers');
        need(['Approval Required']);
        if (!reason.trim())
          throw ppErr(PP_ERRORS.INVALID, 'Say what needs to change.');
        return mv('Revised', 'Offer approval rejected');
      case 'generate': {
        this.ctx.need(a, 'recruit', 'Generating offer letters');
        need(['Approved']);
        if (o.approvedComp == null || num(o.approvedComp) !== num(o.comp))
          throw ppErr(
            PP_ERRORS.APPROVAL,
            'APPROVAL_REQUIRED — this version isn’t approved.',
          );
        return this.ctx.once(
          a.rootId,
          `offdoc_${o.id}_v${o.version}`,
          async () => {
            const body = await this.letter(a, o, c);
            const doc = await this.bridge.fileDoc(a, {
              title: `Offer letter · ${c.name} · ${o.number} v${o.version}`,
              type: 'Employment Document',
              linkId: o.id,
              text: { name: `offer-${o.number}-v${o.version}`, body },
              expiresOn: o.expiresOn.toISOString().slice(0, 10),
            });
            await mv('Document Generated', 'Offer document generated', {
              docId: doc.id,
            });
            return { status: 'Document Generated', doc: doc.number };
          },
        );
      }
      case 'send': {
        this.ctx.need(a, 'recruit', 'Sending offers');
        need(['Document Generated']);
        if (o.approvedComp == null || num(o.approvedComp) !== num(o.comp))
          throw ppErr(
            PP_ERRORS.APPROVAL,
            'APPROVAL_REQUIRED — this version isn’t approved.',
          );
        if (!o.docId)
          throw ppErr(PP_ERRORS.INVALID, 'Generate the offer document first.');
        return this.ctx.once(
          a.rootId,
          `offsign_${o.id}_v${o.version}`,
          async () => {
            const s = await this.bridge.sign(
              a,
              o.docId!,
              { name: c.name, email: c.email },
              o.expiresOn.toISOString().slice(0, 10),
            );
            await mv(
              s.failed ? 'Signature Requested' : 'Sent',
              s.failed
                ? 'Offer signature email failed'
                : 'Offer sent for signature',
              { signRequestId: s.id },
            );
            return {
              status: s.failed ? 'Signature Requested' : 'Sent',
              request: s.number,
              failed: s.failed,
            };
          },
        );
      }
      case 'refresh': {
        need(['Sent', 'Viewed', 'Signature Requested']);
        return this.syncSign(a.rootId, o, a);
      }
      case 'decline':
        this.ctx.need(a, 'recruit', 'Recording declines');
        need([
          'Sent',
          'Viewed',
          'Signature Requested',
          'Approved',
          'Document Generated',
        ]);
        if (!reason.trim())
          throw ppErr(PP_ERRORS.INVALID, 'Decline reason required.');
        if (o.signRequestId)
          await this.bridge.voidSign(
            a,
            o.signRequestId,
            `Candidate declined: ${reason}`,
          );
        return mv('Declined', 'Offer declined', {
          declineReason: reason.slice(0, 500),
        });
      case 'withdraw':
        this.ctx.need(a, 'recruit', 'Withdrawing offers');
        need([
          'Sent',
          'Viewed',
          'Signature Requested',
          'Approved',
          'Document Generated',
          'Draft',
          'Revised',
          'Approval Required',
        ]);
        if (!reason.trim()) throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
        if (o.signRequestId)
          await this.bridge.voidSign(
            a,
            o.signRequestId,
            `Offer withdrawn: ${reason}`,
          );
        return mv('Withdrawn', 'Offer withdrawn');
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    }
  }

  private async letter(a: PpActor, o: Offer, c: Cand) {
    const biz = await this.ctx.business(a.rootId);
    const job = await this.db.ppJob.findFirstOrThrow({
      where: { id: o.jobId },
    });
    const group = await this.ctx.branches(a.rootId);
    const br = group.find((g) => g.id === o.branchId)?.name ?? biz.name;
    const money = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(num(o.comp));
    return [
      `${biz.name}`,
      `${biz.address ?? ''}`.trim(),
      '',
      `OFFER OF EMPLOYMENT — ${o.number} (version ${o.version})`,
      '',
      `Dear ${c.name},`,
      '',
      `We are pleased to offer you the position of ${job.title} (${job.department}) at ${br}, on the following terms:`,
      '',
      `• Employment type: ${o.employmentType}`,
      `• Start date: ${o.startDate.toISOString().slice(0, 10)}`,
      `• Compensation: ${biz.currency} ${money} ${o.frequency === 'Hourly' ? 'per hour' : 'per month'}`,
      `• Probation: ${o.probation}`,
      ...(o.benefits ? [`• Benefits: ${o.benefits}`] : []),
      ...(o.conditions ? [`• Conditions: ${o.conditions}`] : []),
      '',
      `This offer is valid until ${o.expiresOn.toISOString().slice(0, 10)}. To accept, sign this letter electronically.`,
      '',
      `Sincerely,`,
      `${a.name}`,
      `${biz.name}`,
    ].join('\n');
  }

  /** Reads the Noxtill eSign request and moves the offer (used by the button and the hourly sweep). */
  async syncSign(rootId: string, o: Offer, a?: PpActor) {
    if (!o.signRequestId) return { status: o.status, changed: false };
    const s = await this.bridge.signStatus(rootId, o.signRequestId);
    if (!s) return { status: o.status, changed: false };
    const to =
      s.status === 'Completed'
        ? 'Accepted'
        : s.status === 'Declined'
          ? 'Declined'
          : s.status === 'Expired'
            ? 'Expired'
            : s.status === 'Voided'
              ? o.status
              : s.signer === 'Viewed'
                ? 'Viewed'
                : s.signer === 'Delivery Failed'
                  ? 'Signature Requested'
                  : s.signer === 'Sent'
                    ? 'Sent'
                    : o.status;
    if (to === o.status) return { status: o.status, changed: false };
    const who = a ?? 'System';
    await this.db.$transaction(async (tx) => {
      await tx.ppOffer.update({
        where: { id: o.id },
        data: {
          status: to,
          ...(to === 'Declined'
            ? { declineReason: s.declineReason ?? 'Declined in eSign' }
            : {}),
        },
      });
      await this.ctx.audit(
        rootId,
        who,
        to === 'Accepted'
          ? 'Offer accepted (signed)'
          : `Offer ${to.toLowerCase()}`,
        'offer',
        o.id,
        `${o.number} · eSign ${s.status}`,
        { tx },
      );
      if (to === 'Accepted') await this.openOnboarding(tx, rootId, o);
    });
    if (to === 'Accepted') {
      const job = await this.db.ppJob.findFirst({ where: { id: o.jobId } });
      await this.ctx.notify(
        rootId,
        [o.createdById, job?.recruiterUserId, job?.managerUserId],
        `Offer accepted: ${o.number}`,
        'Signed in Noxtill eSign — next: Hire / convert to Staff',
        '/people/offers',
      );
    }
    return { status: to, changed: true };
  }

  /** Accepted offer → onboarding case (still a candidate until hired). */
  private async openOnboarding(
    tx: Prisma.TransactionClient,
    rootId: string,
    o: Offer,
  ) {
    if (
      await tx.ppOnboarding.findFirst({ where: { candidateId: o.candidateId } })
    )
      return;
    const cfg = await this.ctx.config(rootId);
    const job = await tx.ppJob.findFirst({ where: { id: o.jobId } });
    const number = await this.ctx.number(rootId, 'onb', tx);
    await tx.ppOnboarding.create({
      data: {
        businessId: rootId,
        number,
        candidateId: o.candidateId,
        startDate: o.startDate,
        template: `${job?.department ?? 'Standard'} onboarding`,
        managerUserId: job?.managerUserId ?? null,
        buddyUserId: null,
        status: 'Not Started',
        items: cfg.onboarding.template.map((t) => ({
          ...t,
          done: t.kind === 'doc' && t.t.toLowerCase().includes('contract'),
          ref:
            t.kind === 'doc' && t.t.toLowerCase().includes('contract')
              ? (o.docId ?? null)
              : null,
          task: null,
          taskId: null,
          ovr: null,
          doneAt: null,
        })),
      },
    });
    await this.ctx.audit(
      rootId,
      'System',
      'Onboarding opened',
      'onboarding',
      o.candidateId,
      `${number} · from accepted ${o.number}`,
      { tx },
    );
  }

  async signedLink(a: PpActor, id: string) {
    const o = await this.offer(a, id);
    if (!o.docId)
      throw ppErr(
        PP_ERRORS.NOT_FOUND,
        'No document on this offer.',
        HttpStatus.NOT_FOUND,
      );
    return this.bridge.docLink(a, o.docId);
  }
}
