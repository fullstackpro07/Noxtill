import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import {
  ADMIN_PERMISSION_LABELS,
  ALL_ADMIN_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from '../super-admin.constants';
import {
  badRequest,
  dateRange,
  notFound,
  pageArgs,
  PageQuery,
  toCsv,
} from '../super-admin.util';

/** A one-time password the new admin must use once, then is forced through TOTP enrollment. */
function temporaryPassword(): string {
  // 18 random chars + a guaranteed upper/lower/digit to satisfy the admin password rule.
  return `${randomBytes(12).toString('base64url')}Aa1`;
}

/** Admin users, roles and the read-only admin audit log (PRD §6, §11.4). */
@Injectable()
export class AdminAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly auth: AdminAuthService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async list() {
    const admins = await this.prisma.platformAdmin.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        email: true,
        name: true,
        roleKey: true,
        status: true,
        totpEnabledAt: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
        role: { select: { name: true } },
        _count: {
          select: {
            sessions: {
              where: { revokedAt: null, expiresAt: { gt: new Date() } },
            },
          },
        },
      },
    });
    return admins.map(({ _count, role, ...a }) => ({
      ...a,
      roleName: role.name,
      mfaEnrolled: !!a.totpEnabledAt,
      activeSessions: _count.sessions,
    }));
  }

  async create(
    input: { email: string; name: string; roleKey: string },
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw badRequest('Enter a valid email.');
    if (!input.name?.trim()) throw badRequest('Name is required.');
    const role = await this.prisma.platformAdminRole.findUnique({
      where: { key: input.roleKey },
    });
    if (!role) throw badRequest('Unknown role.');
    if (await this.prisma.platformAdmin.findUnique({ where: { email } }))
      throw badRequest('An admin with that email already exists.');
    const password = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(password);
    const admin = await this.audit.run(
      ctx,
      (tx) =>
        tx.platformAdmin.create({
          data: {
            email,
            name: input.name.trim(),
            roleKey: role.key,
            passwordHash,
            createdById: ctx.admin.id,
          },
          select: { id: true, email: true, name: true, roleKey: true },
        }),
      (a) => ({
        action: 'admin.created',
        resourceType: 'admin',
        resourceId: a.id,
        after: { email, name: input.name.trim(), role: role.key },
        reason,
      }),
    );
    // Shown once to the creating admin; only the bcrypt hash is stored.
    return { admin, temporaryPassword: password };
  }

  async update(
    id: string,
    input: { roleKey?: string; status?: string; name?: string },
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!admin) throw notFound('Admin');
    if (
      id === ctx.admin.id &&
      (input.status === 'disabled' ||
        (input.roleKey && input.roleKey !== admin.roleKey))
    )
      throw badRequest('You cannot disable yourself or change your own role.');
    if (input.status && !['active', 'disabled'].includes(input.status))
      throw badRequest('Status must be active or disabled.');
    if (
      input.roleKey &&
      !(await this.prisma.platformAdminRole.findUnique({
        where: { key: input.roleKey },
      }))
    )
      throw badRequest('Unknown role.');
    await this.assertNotLastSuperAdmin(admin, input);
    const result = await this.audit.run(
      ctx,
      async (tx) => {
        const updated = await tx.platformAdmin.update({
          where: { id },
          data: {
            ...(input.roleKey ? { roleKey: input.roleKey } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.name?.trim() ? { name: input.name.trim() } : {}),
          },
          select: {
            id: true,
            email: true,
            name: true,
            roleKey: true,
            status: true,
          },
        });
        if (input.status === 'disabled')
          await tx.platformAdminSession.updateMany({
            where: { adminId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        return updated;
      },
      () => ({
        action:
          input.roleKey && input.roleKey !== admin.roleKey
            ? 'admin.role_changed'
            : input.status === 'disabled'
              ? 'admin.disabled'
              : input.status === 'active'
                ? 'admin.enabled'
                : 'admin.updated',
        resourceType: 'admin',
        resourceId: id,
        before: {
          roleKey: admin.roleKey,
          status: admin.status,
          name: admin.name,
        },
        after: input,
        reason,
      }),
    );
    return result;
  }

  /** Forces the admin to enroll a new authenticator at next login (lost phone). */
  async resetMfa(id: string, reason: string, ctx: AdminAuditContext) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!admin) throw notFound('Admin');
    if (id === ctx.admin.id)
      throw badRequest('Ask another admin to reset your own authenticator.');
    await this.audit.run(
      ctx,
      async (tx) => {
        await tx.platformAdmin.update({
          where: { id },
          data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
        });
        await tx.platformAdminSession.updateMany({
          where: { adminId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      () => ({
        action: 'admin.mfa_reset',
        resourceType: 'admin',
        resourceId: id,
        before: { mfaEnrolled: !!admin.totpEnabledAt },
        after: { mfaEnrolled: false, sessionsRevoked: true },
        reason,
      }),
    );
    return { reset: true };
  }

  async resetPassword(id: string, reason: string, ctx: AdminAuditContext) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!admin) throw notFound('Admin');
    if (id === ctx.admin.id)
      throw badRequest('Ask another admin to reset your own password.');
    const password = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(password);
    await this.audit.run(
      ctx,
      async (tx) => {
        await tx.platformAdmin.update({
          where: { id },
          data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
        });
        await tx.platformAdminSession.updateMany({
          where: { adminId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      () => ({
        action: 'admin.password_reset',
        resourceType: 'admin',
        resourceId: id,
        after: { sessionsRevoked: true },
        reason,
      }),
    );
    return { temporaryPassword: password };
  }

  async sessions(adminId: string) {
    return this.prisma.platformAdminSession.findMany({
      where: { adminId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeSessions(
    adminId: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const r = await this.audit.run(
      ctx,
      (tx) =>
        tx.platformAdminSession.updateMany({
          where: {
            adminId,
            revokedAt: null,
            ...(adminId === ctx.admin.id
              ? { id: { not: ctx.admin.sessionId } }
              : {}),
          },
          data: { revokedAt: new Date() },
        }),
      (res) => ({
        action: 'admin.sessions_revoked',
        resourceType: 'admin',
        resourceId: adminId,
        after: { revoked: res.count },
        reason,
      }),
    );
    await this.securityEvents.record({
      type: 'admin_session_revoked',
      adminId,
      metadata: { count: r.count, by: ctx.admin.id },
    });
    return { revoked: r.count };
  }

  // ------------------------------------------------------------------ roles

  async roles() {
    const roles = await this.prisma.platformAdminRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
      include: { _count: { select: { admins: true } } },
    });
    return {
      permissions: ALL_ADMIN_PERMISSIONS.map((key) => ({
        key,
        label: ADMIN_PERMISSION_LABELS[key],
      })),
      roles: roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        locked: r.key === SUPER_ADMIN_ROLE,
        permissions: this.auth.permissionsFor(r),
        admins: r._count.admins,
      })),
    };
  }

  async saveRole(
    key: string,
    input: { name?: string; description?: string; permissions: string[] },
    reason: string,
    ctx: AdminAuditContext,
  ) {
    if (key === SUPER_ADMIN_ROLE)
      throw badRequest('The Super Admin role always has every permission.');
    if (!/^[a-z0-9_]{2,32}$/.test(key))
      throw badRequest(
        'Role key: 2–32 lower-case letters, digits or underscores.',
      );
    const unknown = (input.permissions ?? []).filter(
      (p) => !(ALL_ADMIN_PERMISSIONS as string[]).includes(p),
    );
    if (unknown.length)
      throw badRequest(`Unknown permissions: ${unknown.join(', ')}`);
    const existing = await this.prisma.platformAdminRole.findUnique({
      where: { key },
    });
    if (!existing && !input.name?.trim())
      throw badRequest('A new role needs a name.');
    const permissions = ALL_ADMIN_PERMISSIONS.filter((p) =>
      input.permissions.includes(p),
    );
    await this.audit.run(
      ctx,
      (tx) =>
        tx.platformAdminRole.upsert({
          where: { key },
          create: {
            key,
            name: input.name!.trim(),
            description: input.description ?? null,
            permissions,
            isSystem: false,
          },
          update: {
            ...(input.name?.trim() ? { name: input.name.trim() } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            permissions,
          },
        }),
      () => ({
        action: existing ? 'admin_role.updated' : 'admin_role.created',
        resourceType: 'admin_role',
        resourceId: key,
        before: existing
          ? { name: existing.name, permissions: existing.permissions }
          : null,
        after: { name: input.name ?? existing?.name, permissions },
        reason,
      }),
    );
    return this.roles();
  }

  // -------------------------------------------------------------- audit log

  async auditLog(
    q: PageQuery & {
      adminId?: string;
      businessId?: string;
      action?: string;
      resourceType?: string;
      from?: string;
      to?: string;
    },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const createdAt = dateRange(q.from, q.to);
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(q.adminId ? { adminId: q.adminId } : {}),
      ...(q.businessId ? { businessId: q.businessId } : {}),
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.resourceType ? { resourceType: q.resourceType } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.platformAuditLog.count({ where }),
      this.prisma.platformAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async auditCsv(
    q: Parameters<AdminAdminsService['auditLog']>[0],
    ctx: AdminAuditContext,
  ) {
    const r = await this.auditLog({ ...q, page: '1', pageSize: '10000' });
    await this.audit.record(this.prisma, ctx, {
      action: 'audit.exported',
      resourceType: 'export',
      resourceId: 'platform_audit_logs',
      after: { rows: r.items.length, filters: q },
      reason: 'Admin audit log CSV export',
    });
    return toCsv(
      [
        'id',
        'createdAt',
        'admin',
        'action',
        'resourceType',
        'resourceId',
        'businessId',
        'reason',
        'ipAddress',
        'requestId',
        'before',
        'after',
      ],
      r.items.map((i) => [
        i.id,
        i.createdAt,
        i.adminEmail,
        i.action,
        i.resourceType,
        i.resourceId,
        i.businessId,
        i.reason,
        i.ipAddress,
        i.requestId,
        i.before == null ? '' : JSON.stringify(i.before),
        i.after == null ? '' : JSON.stringify(i.after),
      ]),
    );
  }

  private async assertNotLastSuperAdmin(
    admin: { id: string; roleKey: string; status: string },
    input: { roleKey?: string; status?: string },
  ) {
    const losing =
      admin.roleKey === SUPER_ADMIN_ROLE &&
      admin.status === 'active' &&
      ((input.roleKey && input.roleKey !== SUPER_ADMIN_ROLE) ||
        input.status === 'disabled');
    if (!losing) return;
    const others = await this.prisma.platformAdmin.count({
      where: {
        roleKey: SUPER_ADMIN_ROLE,
        status: 'active',
        id: { not: admin.id },
      },
    });
    if (others === 0)
      throw badRequest(
        'This is the last active Super Admin; promote another admin first.',
      );
  }
}
