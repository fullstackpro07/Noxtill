import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  PpActor,
  PpContextService,
  mask,
  notFound,
  num,
  ppErr,
} from './pp-context.service';
import {
  BASIS,
  EMP_STATUS,
  EMP_TYPES,
  PP_ERRORS,
  TAX_STATUS,
} from './pp.constants';

export interface ProfileIn {
  expectedVersion?: number;
  department?: string;
  title?: string;
  employmentType?: string;
  managerUserId?: string | null;
  payBasis?: string;
  monthlySalary?: number | string | null;
  hourlyRate?: number | string | null;
  startDate?: string | null;
  probationEnd?: string | null;
  contractEnd?: string | null;
  status?: string;
  inPayroll?: boolean | string;
  bankName?: string | null;
  bankAccount?: string | null;
  bankTitle?: string | null;
  taxStatus?: string | null;
  taxId?: string | null;
}

const day = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
const n = (v: unknown) => (v === '' || v == null ? null : Number(v));

/**
 * Employment & payroll profiles. The employee IS the Staff record (BusinessUser); this keeps the
 * People-owned fields beside it. Hourly rate stays on Staff (BusinessUser.hourlyRate) so Staff's own
 * payroll export keeps reading the same number. Bank account and tax ID are encrypted at rest and only
 * the masked tail is ever shown.
 */
@Injectable()
export class PpPeopleService {
  constructor(private readonly ctx: PpContextService) {}

  private get db() {
    return this.ctx.db;
  }

  private async member(a: PpActor, uid: string) {
    const m = (await this.ctx.members(a.rootId, true)).find(
      (x) => x.id === uid,
    );
    if (!m) throw notFound('Employee');
    return m;
  }

  /** Who may edit what on a profile. Employees may only fill their own bank and tax details. */
  private fieldsFor(a: PpActor, uid: string) {
    const self = uid === a.userId;
    return {
      employment: a.onboard || a.offboard || a.owner || a.settings,
      pay: a.salary || a.owner,
      bank: a.payroll || a.owner || self,
      tax: a.payroll || a.owner || self,
    };
  }

  async save(a: PpActor, uid: string, i: ProfileIn) {
    const m = await this.member(a, uid);
    const can = this.fieldsFor(a, uid);
    if (!can.employment && !can.pay && !can.bank)
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — you can’t edit this profile.',
        HttpStatus.FORBIDDEN,
      );
    const cur = await this.db.ppEmployee.findFirst({
      where: { businessUserId: { in: m.buIds } },
    });
    if (
      cur &&
      i.expectedVersion != null &&
      Number(i.expectedVersion) !== cur.version
    )
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${m.name}’s profile changed since you opened it (now v${cur.version}). Nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    const data: Prisma.PpEmployeeUncheckedUpdateInput = {};
    const changed: string[] = [];
    const set = <K extends keyof Prisma.PpEmployeeUncheckedUpdateInput>(
      k: K,
      v: Prisma.PpEmployeeUncheckedUpdateInput[K],
      label: string,
    ) => {
      data[k] = v;
      changed.push(label);
    };
    if (can.employment) {
      if (i.department !== undefined)
        set(
          'department',
          i.department?.trim().slice(0, 60) || null,
          'department',
        );
      if (i.title !== undefined)
        set('title', i.title?.trim().slice(0, 120) || null, 'title');
      if (i.employmentType !== undefined) {
        if (!EMP_TYPES.includes(i.employmentType))
          throw ppErr(PP_ERRORS.INVALID, 'Unknown employment type.');
        set('employmentType', i.employmentType, 'employment type');
      }
      if (i.managerUserId !== undefined) {
        if (i.managerUserId === uid)
          throw ppErr(PP_ERRORS.INVALID, 'Someone can’t be their own manager.');
        if (
          i.managerUserId &&
          !(await this.ctx.members(a.rootId)).some(
            (x) => x.id === i.managerUserId,
          )
        )
          throw ppErr(PP_ERRORS.INVALID, 'Manager must be active staff.');
        set('managerUserId', i.managerUserId || null, 'manager');
      }
      if (i.startDate !== undefined)
        set('startDate', day(i.startDate), 'start date');
      if (i.probationEnd !== undefined)
        set('probationEnd', day(i.probationEnd), 'probation end');
      if (i.contractEnd !== undefined)
        set('contractEnd', day(i.contractEnd), 'contract end');
      if (i.status !== undefined) {
        if (!EMP_STATUS.includes(i.status) || i.status === 'Exited')
          throw ppErr(
            PP_ERRORS.INVALID,
            'Status must be Active, Probation or Notice — exits go through Offboarding.',
          );
        set('status', i.status, 'status');
      }
    }
    let hourly: number | null | undefined;
    if (can.pay) {
      if (i.payBasis !== undefined) {
        if (!BASIS.includes(i.payBasis))
          throw ppErr(PP_ERRORS.INVALID, 'Unknown pay basis.');
        set('payBasis', i.payBasis, 'pay basis');
      }
      if (i.monthlySalary !== undefined) {
        const v = n(i.monthlySalary);
        if (v != null && (!Number.isFinite(v) || v < 0))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Monthly salary must be zero or more.',
          );
        set('monthlySalary', v, 'monthly salary');
      }
      if (i.hourlyRate !== undefined) {
        hourly = n(i.hourlyRate);
        if (hourly != null && (!Number.isFinite(hourly) || hourly < 0))
          throw ppErr(PP_ERRORS.INVALID, 'Hourly rate must be zero or more.');
      }
      if (i.inPayroll !== undefined)
        set(
          'inPayroll',
          i.inPayroll === true || i.inPayroll === 'true' || i.inPayroll === '1',
          'in payroll',
        );
    }
    if (can.bank) {
      if (i.bankName !== undefined)
        set('bankName', i.bankName?.trim().slice(0, 80) || null, 'bank');
      if (i.bankTitle !== undefined)
        set(
          'bankTitle',
          i.bankTitle?.trim().slice(0, 120) || null,
          'account title',
        );
      if (
        i.bankAccount !== undefined &&
        i.bankAccount !== null &&
        i.bankAccount.trim()
      ) {
        const acct = i.bankAccount.replace(/\s+/g, '');
        if (!/^[A-Za-z0-9-]{6,34}$/.test(acct))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Bank account / IBAN must be 6–34 letters or digits.',
          );
        set('bankAccountEnc', this.ctx.encrypt(acct), 'bank account');
        data.bankAccountMask = mask(acct);
      }
    }
    if (can.tax) {
      if (i.taxStatus !== undefined) {
        if (i.taxStatus && !TAX_STATUS.includes(i.taxStatus))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Tax status must be Filer, Non-filer or Exempt.',
          );
        set('taxStatus', i.taxStatus || null, 'tax status');
      }
      if (i.taxId !== undefined && i.taxId !== null && i.taxId.trim()) {
        set('taxIdEnc', this.ctx.encrypt(i.taxId.trim()), 'tax ID');
        data.taxIdMask = mask(i.taxId.trim());
      }
    }
    if (!changed.length && hourly === undefined)
      throw ppErr(PP_ERRORS.INVALID, 'Nothing you may change was submitted.');
    const res = await this.db.$transaction(async (tx) => {
      const p = cur
        ? await tx.ppEmployee.update({
            where: { id: cur.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.ppEmployee.create({
            data: {
              ...(data as Prisma.PpEmployeeUncheckedCreateInput),
              businessId: a.rootId,
              businessUserId: m.buId,
              version: 1,
            },
          });
      if (hourly !== undefined) {
        await tx.businessUser.updateMany({
          where: { id: { in: m.buIds } },
          data: { hourlyRate: hourly },
        });
        changed.push('hourly rate (Staff)');
      }
      await this.ctx.audit(
        a.rootId,
        a,
        'Profile updated',
        'employee',
        uid,
        `${m.name} · ${changed.join(', ')}`,
        { tx },
      );
      return p;
    });
    return { version: res.version, changed };
  }

  /** The profile as the editor may see it (bank/tax are masked; never decrypted for display). */
  async profile(a: PpActor, uid: string) {
    const m = await this.member(a, uid);
    const p = await this.db.ppEmployee.findFirst({
      where: { businessUserId: { in: m.buIds } },
    });
    const bu = await this.db.businessUser.findFirst({
      where: { id: { in: m.buIds }, hourlyRate: { not: null } },
      select: { hourlyRate: true },
    });
    const can = this.fieldsFor(a, uid);
    return {
      uid,
      name: m.name,
      version: p?.version ?? 0,
      can,
      department: p?.department ?? '',
      title: p?.title ?? '',
      employmentType: p?.employmentType ?? 'Full-time',
      managerUserId: p?.managerUserId ?? '',
      payBasis: can.pay ? (p?.payBasis ?? (bu ? 'Hourly' : '')) : null,
      monthlySalary: can.pay
        ? p?.monthlySalary != null
          ? num(p.monthlySalary)
          : null
        : null,
      hourlyRate: can.pay
        ? bu?.hourlyRate != null
          ? num(bu.hourlyRate)
          : null
        : null,
      startDate: p?.startDate?.toISOString().slice(0, 10) ?? '',
      probationEnd: p?.probationEnd?.toISOString().slice(0, 10) ?? '',
      contractEnd: p?.contractEnd?.toISOString().slice(0, 10) ?? '',
      status: p?.status ?? 'Active',
      inPayroll: p ? p.inPayroll : m.role !== Role.owner,
      bankName: can.bank ? (p?.bankName ?? '') : null,
      bankMask: can.bank ? (p?.bankAccountMask ?? '') : null,
      bankTitle: can.bank ? (p?.bankTitle ?? '') : null,
      taxStatus: can.tax ? (p?.taxStatus ?? '') : null,
      taxMask: can.tax ? (p?.taxIdMask ?? '') : null,
    };
  }

  // ── hire: candidate → Staff record (exactly one identity) ──────────────

  async hireCheck(a: PpActor, candId: string) {
    const c = await this.db.ppCandidate.findFirst({
      where: { businessId: a.rootId, id: candId },
    });
    if (!c) throw notFound('Candidate');
    const offer = await this.db.ppOffer.findFirst({
      where: { businessId: a.rootId, candidateId: c.id, status: 'Accepted' },
      orderBy: { updatedAt: 'desc' },
    });
    const ors: Prisma.UserWhereInput[] = [
      { email: c.email.toLowerCase() },
      { email: c.email },
    ];
    if (c.phone) ors.push({ phone: c.phone });
    const user = await this.db.user.findFirst({
      where: { OR: ors },
      select: { id: true, name: true, email: true },
    });
    const group = await this.ctx.branches(a.rootId);
    const link = user
      ? await this.db.businessUser.findFirst({
          where: {
            userId: user.id,
            businessId: { in: group.map((g) => g.id) },
          },
          select: { id: true, active: true, businessId: true },
        })
      : null;
    return { c, offer, user, link };
  }

  async hire(a: PpActor, candId: string, how: 'link' | 'new' | '') {
    this.ctx.need(a, 'recruit', 'Hiring');
    const { c, offer, user } = await this.hireCheck(a, candId);
    if (c.stage === 'Hired')
      throw ppErr(PP_ERRORS.STATUS, `${c.name} is already hired.`);
    if (!offer)
      throw ppErr(
        PP_ERRORS.APPROVAL,
        'APPROVAL_REQUIRED — no accepted offer. Hire only after the offer is signed.',
      );
    if (user && !how)
      throw ppErr(
        PP_ERRORS.INVALID,
        `Review the possible duplicate first — ${user.name} (${user.email ?? 'no email'}) already has a Noxtill account.`,
      );
    const job = await this.db.ppJob.findFirst({ where: { id: c.jobId } });
    const branchId = offer.branchId ?? job?.branchId ?? a.rootId;
    let tempPassword: string | undefined;
    const res = await this.db.$transaction(async (tx) => {
      let userId = how === 'link' && user ? user.id : null;
      if (!userId) {
        if (user && how === 'new')
          throw ppErr(
            PP_ERRORS.INVALID,
            'That email or phone already belongs to a Noxtill account — a second person can’t share it. Link to the existing account or change the candidate’s email.',
          );
        tempPassword = randomBytes(6).toString('hex');
        const u = await tx.user.create({
          data: {
            name: c.name,
            email: c.email.toLowerCase(),
            phone: c.phone || null,
            passwordHash: await bcrypt.hash(tempPassword, 10),
          },
        });
        userId = u.id;
      }
      const existing = await tx.businessUser.findUnique({
        where: { businessId_userId: { businessId: branchId, userId } },
      });
      const bu = existing
        ? await tx.businessUser.update({
            where: { id: existing.id },
            data: {
              active: true,
              ...(offer.frequency === 'Hourly'
                ? { hourlyRate: num(offer.comp) }
                : {}),
            },
          })
        : await tx.businessUser.create({
            data: {
              businessId: branchId,
              userId,
              role: Role.staff,
              commissionRule: {},
              ...(offer.frequency === 'Hourly'
                ? { hourlyRate: num(offer.comp) }
                : {}),
            },
          });
      const prof = await tx.ppEmployee.findUnique({
        where: { businessUserId: bu.id },
      });
      const probMonths = /(\d+)/.exec(offer.probation)?.[1];
      const start = offer.startDate;
      const probEnd = probMonths
        ? new Date(
            Date.UTC(
              start.getUTCFullYear(),
              start.getUTCMonth() + Number(probMonths),
              start.getUTCDate(),
            ),
          )
        : null;
      const pdata = {
        department: job?.department ?? null,
        title: job?.title ?? null,
        employmentType: offer.employmentType,
        managerUserId: job?.managerUserId ?? null,
        payBasis: offer.frequency === 'Hourly' ? 'Hourly' : 'Salaried',
        monthlySalary: offer.frequency === 'Hourly' ? null : offer.comp,
        startDate: start,
        probationEnd: probEnd,
        status: probEnd ? 'Probation' : 'Active',
        inPayroll: true,
      };
      if (prof)
        await tx.ppEmployee.update({
          where: { id: prof.id },
          data: { ...pdata, version: { increment: 1 } },
        });
      else
        await tx.ppEmployee.create({
          data: { ...pdata, businessId: a.rootId, businessUserId: bu.id },
        });
      const hist = [
        ...((c.history as unknown as object[]) ?? []),
        {
          t: `${how === 'link' ? 'Linked to existing Staff account' : 'Staff record created'} · ${c.name}`,
          at: new Date().toISOString(),
          by: a.name,
        },
      ];
      await tx.ppCandidate.update({
        where: { id: c.id },
        data: {
          stage: 'Hired',
          hiredUserId: userId,
          decidedAt: new Date(),
          history: hist,
          version: { increment: 1 },
        },
      });
      const onb = await tx.ppOnboarding.findFirst({
        where: { businessId: a.rootId, candidateId: c.id },
      });
      if (onb)
        await tx.ppOnboarding.update({
          where: { id: onb.id },
          data: { userId },
        });
      if (job && job.status !== 'Filled') {
        const hired = await tx.ppCandidate.count({
          where: { jobId: job.id, stage: 'Hired' },
        });
        if (hired >= job.target)
          await tx.ppJob.update({
            where: { id: job.id },
            data: {
              status: 'Filled',
              closedAt: new Date(),
              version: { increment: 1 },
            },
          });
      }
      await this.ctx.audit(
        a.rootId,
        a,
        'Candidate hired',
        'candidate',
        c.id,
        `${c.number} · ${c.name} → ${how === 'link' ? 'linked' : 'new'} Staff ${bu.id.slice(0, 8)} at ${branchId === a.rootId ? 'main branch' : 'branch'}`,
        { tx },
      );
      return { userId, buId: bu.id, onb: onb?.id ?? null };
    });
    return { ...res, tempPassword };
  }
}
