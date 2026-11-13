import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthTokensService } from '../../auth/auth-tokens.service';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { invalidatePlatformAccessCache } from '../../common/security/platform-access.guard';
import { AdminAuditService } from './admin-audit.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import {
  badRequest,
  dateRange,
  notFound,
  pageArgs,
  PageQuery,
} from '../super-admin.util';

export interface UserListQuery extends PageQuery {
  search?: string;
  businessId?: string;
  role?: string;
  status?: string;
  mfa?: string;
  createdFrom?: string;
  createdTo?: string;
  inactiveDays?: string;
}

/** Global user directory and user actions (PRD §5). */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly authTokens: AuthTokensService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async list(q: UserListQuery) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const and: Prisma.UserWhereInput[] = [];
    const s = q.search?.trim();
    if (s)
      and.push({
        OR: [
          { name: { contains: s } },
          { email: { contains: s } },
          { phone: { contains: s } },
          { id: s },
        ],
      });
    if (q.businessId)
      and.push({
        businessUsers: {
          some: {
            OR: [
              { businessId: q.businessId },
              { business: { parentId: q.businessId } },
            ],
          },
        },
      });
    if (q.role && ['owner', 'manager', 'staff'].includes(q.role))
      and.push({ businessUsers: { some: { role: q.role as Role } } });
    if (q.status === 'active' || q.status === 'suspended')
      and.push({ platformStatus: q.status });
    if (q.status === 'locked') and.push({ lockedUntil: { gt: new Date() } });
    if (q.mfa === 'on') and.push({ twoFactorEnabled: true });
    if (q.mfa === 'off') and.push({ twoFactorEnabled: false });
    const created = dateRange(q.createdFrom, q.createdTo);
    if (created) and.push({ createdAt: created });
    if (q.inactiveDays) {
      const since = new Date(
        Date.now() - Math.max(1, Number(q.inactiveDays) || 30) * 86_400_000,
      );
      and.push({ sessions: { none: { lastUsedAt: { gte: since } } } });
    }
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          twoFactorEnabled: true,
          platformStatus: true,
          lockedUntil: true,
          businessUsers: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              role: true,
              active: true,
              business: {
                select: { id: true, name: true, parentId: true },
              },
            },
          },
        },
      }),
    ]);
    const last = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) } },
      _max: { createdAt: true },
    });
    return {
      items: users.map((u) => {
        const primary = u.businessUsers[0];
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          business: primary?.business ?? null,
          tenantId: primary
            ? (primary.business.parentId ?? primary.business.id)
            : null,
          role: primary?.role ?? null,
          memberships: u.businessUsers.length,
          membershipActive: primary?.active ?? null,
          platformStatus: u.platformStatus,
          locked: !!u.lockedUntil && u.lockedUntil > new Date(),
          createdAt: u.createdAt,
          lastLoginAt:
            last.find((l) => l.userId === u.id)?._max.createdAt ?? null,
          mfa: u.twoFactorEnabled,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
        authIdentities: { select: { provider: true } },
        _count: { select: { passkeyCredentials: true } },
        platformStatus: true,
        platformStatusReason: true,
        platformStatusAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        businessUsers: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            role: true,
            active: true,
            createdAt: true,
            customRole: { select: { name: true } },
            business: {
              select: {
                id: true,
                name: true,
                parentId: true,
                platformStatus: true,
              },
            },
          },
        },
      },
    });
    if (!user) throw notFound('User');
    const [sessions, security, activity, changes] = await Promise.all([
      this.prisma.session.findMany({
        where: { userId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          businessId: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      }),
      this.prisma.securityEvent.findMany({
        where: { userId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      this.prisma.activityEvent.findMany({
        where: { actorUserId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: { actorUserId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
          businessId: true,
        },
      }),
    ]);
    const { authIdentities, _count, ...rest } = user;
    const signInProviders = authIdentities.map((i) => i.provider);
    return {
      user: {
        ...rest,
        googleLinked: signInProviders.includes('google'),
        signInProviders,
        passkeys: _count.passkeyCredentials,
      },
      sessions,
      security,
      activity,
      changes,
    };
  }

  async setStatus(
    id: string,
    status: 'active' | 'suspended',
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { platformStatus: true, platformStatusReason: true },
    });
    if (!user) throw notFound('User');
    if (user.platformStatus === status)
      throw badRequest(`This user is already ${status}.`);
    const text = AdminAuditService.requireReason(reason);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          platformStatus: status,
          platformStatusReason: status === 'active' ? null : text,
          platformStatusAt: new Date(),
        },
      });
      await this.audit.record(tx, ctx, {
        action: status === 'active' ? 'user.restored' : 'user.suspended',
        resourceType: 'user',
        resourceId: id,
        before: user,
        after: { platformStatus: status },
        reason: text,
      });
      return { id, platformStatus: status };
    });
    invalidatePlatformAccessCache();
    return result;
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) throw notFound('Session');
    if (session.revokedAt)
      throw badRequest('That session is already signed out.');
    await this.audit.run(
      ctx,
      (tx) =>
        tx.session.update({
          where: { id: sessionId },
          data: { revokedAt: new Date() },
        }),
      () => ({
        action: 'user.session_revoked',
        resourceType: 'session',
        resourceId: sessionId,
        businessId: session.businessId,
        after: { userId },
        reason,
      }),
    );
    invalidatePlatformAccessCache();
    await this.securityEvents.record({
      type: 'session_revoked',
      userId,
      businessId: session.businessId,
      adminId: ctx.admin.id,
      metadata: { sessionId, by: 'super_admin' },
    });
    return { revoked: 1 };
  }

  async revokeAll(userId: string, reason: string, ctx: AdminAuditContext) {
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw notFound('User');
    const r = await this.audit.run(
      ctx,
      (tx) =>
        tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      (res) => ({
        action: 'user.sessions_revoked',
        resourceType: 'user',
        resourceId: userId,
        after: { revoked: res.count },
        reason,
      }),
    );
    invalidatePlatformAccessCache();
    await this.securityEvents.record({
      type: 'session_revoked',
      userId,
      adminId: ctx.admin.id,
      metadata: { all: true, count: r.count, by: 'super_admin' },
    });
    return { revoked: r.count };
  }

  /**
   * Change a membership's role between manager and staff. Ownership changes are refused here:
   * transferring ownership has billing and legal consequences and no validated flow exists yet.
   */
  async changeRole(
    membershipId: string,
    role: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    if (role !== 'manager' && role !== 'staff')
      throw badRequest('Role must be manager or staff.');
    const m = await this.prisma.businessUser.findUnique({
      where: { id: membershipId },
      select: { id: true, role: true, businessId: true, userId: true },
    });
    if (!m) throw notFound('Membership');
    if (m.role === 'owner')
      throw badRequest(
        'Ownership transfer is not supported from the admin console. The owner role cannot be changed here.',
      );
    if (m.role === role) throw badRequest(`This person is already ${role}.`);
    return this.audit.run(
      ctx,
      (tx) =>
        tx.businessUser.update({
          where: { id: membershipId },
          data: { role: role },
          select: { id: true, role: true },
        }),
      () => ({
        action: 'user.role_changed',
        resourceType: 'membership',
        resourceId: membershipId,
        businessId: m.businessId,
        before: { role: m.role },
        after: { role },
        reason,
      }),
    );
  }

  /** Tenant-level activate/deactivate of one membership (the owner's own staff switch). */
  async setMembershipActive(
    membershipId: string,
    active: boolean,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const m = await this.prisma.businessUser.findUnique({
      where: { id: membershipId },
      select: { id: true, role: true, active: true, businessId: true },
    });
    if (!m) throw notFound('Membership');
    if (m.role === 'owner' && !active)
      throw badRequest(
        'The owner membership cannot be deactivated. Suspend the user or the business instead.',
      );
    if (m.active === active)
      throw badRequest(
        `This membership is already ${active ? 'active' : 'inactive'}.`,
      );
    const r = await this.audit.run(
      ctx,
      (tx) =>
        tx.businessUser.update({
          where: { id: membershipId },
          data: { active },
          select: { id: true, active: true },
        }),
      () => ({
        action: active
          ? 'user.membership_activated'
          : 'user.membership_deactivated',
        resourceType: 'membership',
        resourceId: membershipId,
        businessId: m.businessId,
        before: { active: m.active },
        after: { active },
        reason,
      }),
    );
    invalidatePlatformAccessCache();
    return r;
  }

  /** Sends the real self-service reset email — the admin never sees or sets the password. */
  async sendPasswordReset(
    userId: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw notFound('User');
    if (!user.email)
      throw badRequest(
        'This user has no email address, so a reset link cannot be sent.',
      );
    const text = AdminAuditService.requireReason(reason);
    const sent = await this.authTokens.sendPasswordReset(user.id, user.email);
    await this.audit.record(this.prisma, ctx, {
      action: 'user.password_reset_sent',
      resourceType: 'user',
      resourceId: userId,
      after: { sent },
      reason: text,
    });
    await this.securityEvents.record({
      type: 'password_reset_requested',
      userId,
      identifier: user.email,
      adminId: ctx.admin.id,
      metadata: { via: 'super_admin', sent },
    });
    return { sent };
  }
}
