import { HttpStatus, Injectable } from '@nestjs/common';
import { FinAccount, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  r2,
  ymd,
} from './finance-context.service';
import { FinanceJournalsService } from './finance-journals.service';
import {
  ACCOUNT_TYPES,
  FIN_ERRORS,
  FinanceConfig,
  mergeConfig,
} from './finance.constants';

export interface AccountInput {
  code: string;
  name: string;
  type: string;
  subtype: string;
  parentId?: string | null;
  currency?: string | null;
  reconcilable?: boolean;
  control?: string | null;
  description?: string | null;
  requiresDepartment?: boolean;
}

const GRANT_CAPS: Record<string, string[]> = {
  'Read only': [CAPABILITIES.FINANCE_VIEW],
  Prepare: [CAPABILITIES.FINANCE_VIEW, CAPABILITIES.FINANCE_MANAGE],
  Approve: [
    CAPABILITIES.FINANCE_VIEW,
    CAPABILITIES.FINANCE_MANAGE,
    CAPABILITIES.FINANCE_APPROVE,
  ],
};

/** Accounting settings, the chart of accounts, tax codes and outside-accountant access. */
@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly journals: FinanceJournalsService,
  ) {}

  // ── settings ─────────────────────────────────────────────────────────────

  /**
   * Save a settings patch (version-checked). Turning any segregation-of-duties rule off needs the
   * Owner: an Owner applies it directly, anyone else raises an Owner approval and nothing changes.
   */
  async save(actor: FinActor, version: number, patch: Partial<FinanceConfig>) {
    this.ctx.need(actor, 'admin', 'Changing accounting settings');
    const row = await this.ctx.settingsRow(actor.rootId);
    if (row.version !== version)
      throw new AppException(
        FIN_ERRORS.VERSION,
        `Settings were changed by someone else (now v${row.version}). Reload and try again.`,
        HttpStatus.CONFLICT,
      );
    const cur = mergeConfig(row.config);
    const next = mergeConfig({
      ...cur,
      ...patch,
      profile: { ...cur.profile, ...(patch.profile ?? {}) },
      posting: { ...cur.posting, ...(patch.posting ?? {}) },
      thresholds: { ...cur.thresholds, ...(patch.thresholds ?? {}) },
      sod: { ...cur.sod, ...(patch.sod ?? {}) },
      close: { ...cur.close, ...(patch.close ?? {}) },
    });
    const t = next.thresholds;
    if (!(
      t.journalDirect > 0 &&
      t.journalOwner > t.journalDirect &&
      t.billOwner > 0
    ))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Thresholds must be positive, and the Owner/Controller journal threshold above the direct-post limit.',
        HttpStatus.BAD_REQUEST,
      );
    if (next.arTermsDays < 0 || next.arTermsDays > 365)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Payment terms must be 0–365 days.',
        HttpStatus.BAD_REQUEST,
      );
    const maps = await this.ctx.accountMaps(actor.rootId);
    const paid = maps.byCode.get(next.expensePaidFrom);
    if (
      !paid ||
      paid.isHeader ||
      (paid.type !== 'asset' && paid.type !== 'liability')
    )
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Expenses must be paid from an asset or liability account.',
        HttpStatus.BAD_REQUEST,
      );
    for (const [cat, code] of Object.entries(next.expenseMap))
      if (!maps.byCode.get(code))
        throw new AppException(
          FIN_ERRORS.INVALID,
          `Expense category “${cat}” maps to unknown account ${code}.`,
          HttpStatus.BAD_REQUEST,
        );
    const sodOff = (
      Object.keys(next.sod) as (keyof FinanceConfig['sod'])[]
    ).filter((k) => cur.sod[k] && !next.sod[k]);
    if (sodOff.length && actor.role !== 'Owner') {
      const held = { ...next, sod: cur.sod };
      await this.journals.requestApproval(actor.rootId, actor, {
        subjectType: 'settings',
        subjectId: row.id,
        title: 'Turn off segregation of duties',
        amount: null,
        rule: 'Disabling segregation of duties needs the Owner',
        level: 'admin',
        payload: { sod: next.sod },
      });
      await this.write(
        actor,
        row.version,
        held,
        'settings.saved (SoD change sent to Owner)',
      );
      return { version: row.version + 1, pendingOwner: true };
    }
    await this.write(actor, row.version, next, 'settings.saved');
    return { version: row.version + 1, pendingOwner: false };
  }

  private async write(
    actor: FinActor,
    version: number,
    cfg: FinanceConfig,
    action: string,
  ) {
    const res = await this.prisma.finSettings.updateMany({
      where: { businessId: actor.rootId, version },
      data: {
        config: cfg as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (res.count !== 1)
      throw new AppException(
        FIN_ERRORS.VERSION,
        'Settings changed while saving — reload.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.audit(
      actor.rootId,
      actor,
      action,
      'settings',
      actor.rootId,
      `v${version + 1}`,
    );
  }

  /** Owner approves a pending SoD change. */
  async approveSettings(actor: FinActor, approvalId: string) {
    if (actor.role !== 'Owner')
      throw new AppException(
        FIN_ERRORS.FORBIDDEN,
        'Only the Owner can approve turning off segregation of duties.',
        HttpStatus.FORBIDDEN,
      );
    const a = await this.prisma.finApproval.findFirst({
      where: {
        id: approvalId,
        businessId: actor.rootId,
        subjectType: 'settings',
        status: 'Pending',
      },
    });
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    const row = await this.ctx.settingsRow(actor.rootId);
    const cur = mergeConfig(row.config);
    const sod =
      (a.payload as { sod?: FinanceConfig['sod'] } | null)?.sod ?? cur.sod;
    await this.write(
      actor,
      row.version,
      { ...cur, sod },
      'settings.sod_change_approved',
    );
    await this.journals.decide(
      actor.rootId,
      'settings',
      a.subjectId,
      'Approved',
      actor,
    );
  }

  // ── chart of accounts ────────────────────────────────────────────────────

  private validateAccount(dto: AccountInput) {
    if (!/^\d{3,6}$/.test(dto.code))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Account code must be 3–6 digits.',
        HttpStatus.BAD_REQUEST,
      );
    if (!ACCOUNT_TYPES[dto.type])
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose an account type.',
        HttpStatus.BAD_REQUEST,
      );
    if (!dto.name?.trim())
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Account name is required.',
        HttpStatus.BAD_REQUEST,
      );
  }

  async addAccount(actor: FinActor, dto: AccountInput) {
    this.ctx.need(actor, 'manage', 'Adding an account');
    this.validateAccount(dto);
    const rootId = actor.rootId;
    if (
      await this.prisma.finAccount.findFirst({
        where: { businessId: rootId, code: dto.code },
      })
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `Account code ${dto.code} is already used.`,
        HttpStatus.CONFLICT,
      );
    if (dto.control && !actor.admin) {
      await this.journals.requestApproval(actor.rootId, actor, {
        subjectType: 'account',
        subjectId: `new:${dto.code}`,
        title: `New control account ${dto.code} ${dto.name}`,
        amount: null,
        rule: 'Control account change — Owner + Finance Admin',
        level: 'admin',
        payload: dto as unknown as Prisma.InputJsonValue,
      });
      return { pending: true, account: null };
    }
    const a = await this.createAccount(rootId, dto);
    await this.ctx.audit(
      rootId,
      actor,
      'account.created',
      'account',
      a.id,
      `${a.code} ${a.name}`,
    );
    return { pending: false, account: a };
  }

  private async createAccount(rootId: string, dto: AccountInput) {
    const base = await this.ctx.baseCurrency(rootId);
    return this.prisma.finAccount.create({
      data: {
        businessId: rootId,
        code: dto.code,
        name: dto.name.trim().slice(0, 120),
        type: dto.type,
        subtype: (dto.subtype || ACCOUNT_TYPES[dto.type]).slice(0, 40),
        parentId: dto.parentId ?? null,
        currency:
          dto.currency && dto.currency !== base
            ? dto.currency.toUpperCase()
            : null,
        reconcilable: !!dto.reconcilable,
        control: dto.control ?? null,
        description: dto.description?.slice(0, 500) ?? null,
        requiresDepartment: !!dto.requiresDepartment,
      },
    });
  }

  async mustAccount(rootId: string, id: string): Promise<FinAccount> {
    const a = await this.prisma.finAccount.findFirst({
      where: { id, businessId: rootId },
    });
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Account not found',
        HttpStatus.NOT_FOUND,
      );
    return a;
  }

  async editAccount(actor: FinActor, id: string, dto: Partial<AccountInput>) {
    this.ctx.need(actor, 'manage', 'Editing an account');
    const a = await this.mustAccount(actor.rootId, id);
    const used =
      (await this.prisma.finJournalLine.count({
        where: {
          businessId: actor.rootId,
          accountId: id,
          postedAt: { not: null },
        },
      })) > 0;
    if (
      used &&
      ((dto.code && dto.code !== a.code) ||
        (dto.type && dto.type !== a.type) ||
        (dto.currency !== undefined && (dto.currency || null) !== a.currency))
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Code, type and currency can’t change once an account has postings.',
        HttpStatus.CONFLICT,
      );
    if (dto.code && dto.code !== a.code) {
      this.validateAccount({ ...a, ...dto });
      if (
        await this.prisma.finAccount.findFirst({
          where: { businessId: actor.rootId, code: dto.code },
        })
      )
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `Account code ${dto.code} is already used.`,
          HttpStatus.CONFLICT,
        );
    }
    if ((a.control || dto.control) && !actor.admin) {
      await this.journals.requestApproval(actor.rootId, actor, {
        subjectType: 'account',
        subjectId: id,
        title: `Edit control account ${a.code} ${a.name}`,
        amount: null,
        rule: 'Control account change — Owner + Finance Admin',
        level: 'admin',
        payload: dto,
      });
      return { pending: true };
    }
    await this.applyEdit(actor, id, dto);
    return { pending: false };
  }

  private async applyEdit(
    actor: FinActor,
    id: string,
    dto: Partial<AccountInput>,
  ) {
    const a = await this.prisma.finAccount.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name?.trim().slice(0, 120),
        type: dto.type,
        subtype: dto.subtype?.slice(0, 40),
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        reconcilable: dto.reconcilable,
        control: dto.control === undefined ? undefined : dto.control,
        description:
          dto.description === undefined
            ? undefined
            : (dto.description?.slice(0, 500) ?? null),
        requiresDepartment: dto.requiresDepartment,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'account.edited',
      'account',
      id,
      `${a.code} ${a.name}`,
    );
  }

  async approveAccount(actor: FinActor, approvalId: string) {
    this.ctx.need(actor, 'admin', 'Approving a control account change');
    const ap = await this.prisma.finApproval.findFirst({
      where: {
        id: approvalId,
        businessId: actor.rootId,
        subjectType: 'account',
        status: 'Pending',
      },
    });
    if (!ap)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    if (ap.requestedById === actor.userId)
      throw new AppException(
        FIN_ERRORS.SOD,
        'Someone other than the requester has to approve this.',
        HttpStatus.FORBIDDEN,
      );
    const dto = ap.payload as unknown as AccountInput;
    if (ap.subjectId.startsWith('new:')) {
      const a = await this.createAccount(actor.rootId, dto);
      await this.ctx.audit(
        actor.rootId,
        actor,
        'account.created',
        'account',
        a.id,
        `${a.code} ${a.name} (approved)`,
      );
    } else await this.applyEdit(actor, ap.subjectId, dto);
    await this.journals.decide(
      actor.rootId,
      'account',
      ap.subjectId,
      'Approved',
      actor,
    );
  }

  async setActive(actor: FinActor, id: string, active: boolean) {
    this.ctx.need(
      actor,
      'admin',
      active ? 'Reactivating an account' : 'Deactivating an account',
    );
    const a = await this.mustAccount(actor.rootId, id);
    if (!active) {
      if (a.control)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'Control accounts cannot be deactivated.',
          HttpStatus.CONFLICT,
        );
      if (a.isHeader)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'Header accounts cannot be deactivated.',
          HttpStatus.CONFLICT,
        );
      if (a.systemKey)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `${a.code} is used by automatic postings (${a.systemKey.replace(/_/g, ' ')}). It must stay active.`,
          HttpStatus.CONFLICT,
        );
      if (
        await this.prisma.finBankAccount.findFirst({
          where: { glAccountId: id, active: true },
        })
      )
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'A bank account is linked to this account.',
          HttpStatus.CONFLICT,
        );
      const t = await this.prisma.finJournalLine.aggregate({
        where: {
          businessId: actor.rootId,
          accountId: id,
          postedAt: { not: null },
        },
        _sum: { debit: true, credit: true },
      });
      const bal = r2(Number(t._sum.debit ?? 0) - Number(t._sum.credit ?? 0));
      if (bal)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `${a.code} has a balance of ${Math.abs(bal).toFixed(2)} — move it with a journal before deactivating.`,
          HttpStatus.CONFLICT,
        );
    }
    await this.prisma.finAccount.update({ where: { id }, data: { active } });
    await this.ctx.audit(
      actor.rootId,
      actor,
      active ? 'account.reactivated' : 'account.deactivated',
      'account',
      id,
      `${a.code} ${a.name}`,
    );
  }

  async setTaxCode(
    actor: FinActor,
    dto: {
      code: string;
      name: string;
      rate: number;
      kind: string;
      accountId?: string;
      active?: boolean;
    },
  ) {
    this.ctx.need(actor, 'admin', 'Changing tax codes');
    const maps = await this.ctx.accountMaps(actor.rootId);
    const accountId =
      dto.accountId ??
      maps.byKey.get(dto.kind === 'output' ? 'output_tax' : 'input_tax')!.id;
    const code = dto.code.trim().toUpperCase().slice(0, 20);
    const row = await this.prisma.finTaxCode.upsert({
      where: { businessId_code: { businessId: actor.rootId, code } },
      create: {
        businessId: actor.rootId,
        code,
        name: dto.name.slice(0, 80),
        rate: dto.rate,
        kind: dto.kind === 'output' ? 'output' : 'input',
        accountId,
        active: dto.active ?? true,
      },
      update: {
        name: dto.name.slice(0, 80),
        rate: dto.rate,
        kind: dto.kind === 'output' ? 'output' : 'input',
        accountId,
        active: dto.active ?? true,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'tax.code_saved',
      'taxcode',
      row.id,
      `${code} ${dto.rate}%`,
    );
    return row;
  }

  // ── accountant access ────────────────────────────────────────────────────

  async grants(rootId: string) {
    return this.prisma.finAccessGrant.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(
    actor: FinActor,
    dto: {
      name: string;
      email: string;
      firm?: string;
      permission: string;
      branches?: string[];
      expiresOn: string;
    },
  ) {
    this.ctx.need(actor, 'admin', 'Inviting an accountant');
    const caps = GRANT_CAPS[dto.permission];
    if (!caps)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose Read only, Prepare or Approve.',
        HttpStatus.BAD_REQUEST,
      );
    const email = dto.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Enter a valid email address.',
        HttpStatus.BAD_REQUEST,
      );
    const expiresOn = dayOf(dto.expiresOn);
    if (expiresOn <= dayOf(new Date()))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose an expiry date in the future.',
        HttpStatus.BAD_REQUEST,
      );
    const branchIds = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    const scope = (dto.branches ?? []).filter((b) => branchIds.includes(b));
    const rootId = actor.rootId;
    const roleName = `Finance accountant · ${dto.permission}`;
    let tempPassword: string | undefined;
    const res = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({ where: { email } });
      if (!user) {
        tempPassword = randomBytes(9).toString('base64url');
        user = await tx.user.create({
          data: {
            name: dto.name.trim().slice(0, 120),
            email,
            passwordHash: await bcrypt.hash(tempPassword, 10),
          },
        });
      }
      const existing = await tx.businessUser.findUnique({
        where: { businessId_userId: { businessId: rootId, userId: user.id } },
      });
      if (existing?.active)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `${email} is already a member of this business — change their role in Staff › Roles instead.`,
          HttpStatus.CONFLICT,
        );
      const role =
        (await tx.customRole.findUnique({
          where: { businessId_name: { businessId: rootId, name: roleName } },
        })) ??
        (await tx.customRole.create({
          data: { businessId: rootId, name: roleName, capabilities: caps },
        }));
      const bu = existing
        ? await tx.businessUser.update({
            where: { id: existing.id },
            data: { active: true, role: Role.staff, customRoleId: role.id },
          })
        : await tx.businessUser.create({
            data: {
              businessId: rootId,
              userId: user.id,
              role: Role.staff,
              customRoleId: role.id,
            },
          });
      const grant = await tx.finAccessGrant.create({
        data: {
          businessId: rootId,
          userId: user.id,
          businessUserId: bu.id,
          name: dto.name.trim().slice(0, 120),
          email,
          firm: dto.firm?.trim().slice(0, 120) || null,
          permission: dto.permission,
          branches: scope,
          expiresOn,
          status: 'Invited',
          invitedById: actor.userId,
        },
      });
      return grant;
    });
    await this.ctx.audit(
      rootId,
      actor,
      'access.accountant_invited',
      'access',
      res.id,
      `${dto.name} <${email}> · ${dto.permission} · expires ${ymd(expiresOn)}`,
    );
    return { grant: res, tempPassword };
  }

  async revoke(actor: FinActor, id: string) {
    this.ctx.need(actor, 'admin', 'Revoking accountant access');
    const g = await this.prisma.finAccessGrant.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!g)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Access grant not found',
        HttpStatus.NOT_FOUND,
      );
    await this.endGrant(g.id, 'Revoked');
    await this.ctx.audit(
      actor.rootId,
      actor,
      'access.revoked',
      'access',
      id,
      `${g.name} <${g.email}>`,
    );
  }

  private async endGrant(id: string, status: 'Revoked' | 'Expired') {
    const g = await this.prisma.finAccessGrant.update({
      where: { id },
      data: { status },
    });
    if (g.businessUserId)
      await this.prisma.businessUser
        .update({ where: { id: g.businessUserId }, data: { active: false } })
        .catch(() => undefined);
  }

  /** Job: expire grants past their date (their sign-in is deactivated). */
  async expireGrants(rootId: string) {
    const due = await this.prisma.finAccessGrant.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Invited', 'Active'] },
        expiresOn: { lt: dayOf(new Date()) },
      },
    });
    for (const g of due) {
      await this.endGrant(g.id, 'Expired');
      await this.ctx.audit(
        rootId,
        null,
        'access.expired',
        'access',
        g.id,
        `${g.name} <${g.email}>`,
      );
    }
    return due.length;
  }
}
