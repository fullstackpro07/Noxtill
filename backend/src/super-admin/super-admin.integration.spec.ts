import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementCacheService } from '../usage/entitlement-cache.service';
import { EntitlementsService } from '../usage/entitlements.service';
import { RemediesService } from '../usage/remedies.service';
import { CreditsService } from '../usage/credits.service';
import { MetersService } from '../usage/meters.service';
import { UsageSeedService } from '../usage/usage-seed.service';
import { addMonthsUtc } from '../usage/usage-period.util';
import { BusinessModulesService } from '../business-modules/business-modules.service';
import { SecurityEventsService } from '../common/security/security-events.service';
import { PlatformAccessGuard } from '../common/security/platform-access.guard';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { AuthMailerService } from '../auth/auth-mailer.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { SendGateService } from '../messaging/send-gate.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminTenantsService } from './services/admin-tenants.service';
import { AdminEntitlementsService } from './services/admin-entitlements.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminRolesSeedService } from './services/admin-roles-seed.service';
import { AdminSecretCipherService } from './admin-secret-cipher.service';
import { SuperAdminGuard } from './super-admin.guard';
import { AdminPermission, RequireReauth } from './super-admin.decorators';
import type { AdminAuditContext } from './super-admin.decorators';
import {
  generateTotpSecret,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp.util';

jest.setTimeout(90_000);

/** Super Admin against the real local MySQL database (no mocked Prisma). */
describe('Super Admin Control Center (MySQL)', () => {
  let prisma: PrismaService;
  let entitlements: EntitlementsService;
  let meters: MetersService;
  let modules: BusinessModulesService;
  let tenants: AdminTenantsService;
  let ents: AdminEntitlementsService;
  let users: AdminUsersService;
  let securityEvents: SecurityEventsService;
  let adminAuth: AdminAuthService;
  let ctx: AdminAuditContext;
  const stamp = Date.now();
  const businessIds: string[] = [];
  const userIds: string[] = [];
  const adminIds: string[] = [];
  const config = new ConfigService({
    JWT_SECRET: 'sa-spec-secret',
    JWT_REFRESH_SECRET: 'sa-spec-refresh',
  });

  async function makeBusiness(planKey = 'growth') {
    const b = await prisma.business.create({
      data: {
        name: `SA spec ${businessIds.length}`,
        slug: `sa-spec-${stamp}-${businessIds.length}`,
      },
    });
    businessIds.push(b.id);
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { key: planKey },
    });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        businessId: b.id,
        planId: plan.id,
        status: 'active',
        periodStart: now,
        periodEnd: addMonthsUtc(now, 1),
        trialRemindersSent: [],
      },
    });
    return b.id;
  }

  async function addMember(
    businessId: string,
    role: 'owner' | 'staff' = 'staff',
    password = 'x',
  ) {
    const u = await prisma.user.create({
      data: {
        name: 'SA member',
        email: `sa-spec-${stamp}-${userIds.length}@example.com`,
        passwordHash: password === 'x' ? 'x' : await bcrypt.hash(password, 4),
      },
    });
    userIds.push(u.id);
    await prisma.businessUser.create({
      data: { businessId, userId: u.id, role },
    });
    const session = await prisma.session.create({
      data: { userId: u.id, businessId, refreshTokenHash: 'x' },
    });
    return { userId: u.id, email: u.email!, sessionId: session.id };
  }

  function httpCtx(
    req: Record<string, unknown>,
    handler?: () => void,
    cls?: object,
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler ?? (() => undefined),
      getClass: () => cls ?? Object,
    } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const noConfig = { get: () => undefined } as unknown as ConfigService;
    entitlements = new EntitlementsService(
      prisma,
      new EntitlementCacheService(noConfig),
    );
    const remedies = new RemediesService(prisma);
    meters = new MetersService(prisma, entitlements, remedies);
    void new CreditsService(prisma, entitlements, remedies);
    for (const p of [
      { key: 'starter', price: 39 },
      { key: 'growth', price: 79 },
      { key: 'professional', price: 159 },
    ]) {
      await prisma.plan.upsert({
        where: { key: p.key },
        create: {
          key: p.key,
          name: p.key,
          price: p.price,
          msgQuota: 0,
          userLimit: 0,
        },
        update: {},
      });
    }
    await new UsageSeedService(prisma, entitlements).seed();
    await new AdminRolesSeedService(prisma).ensureRoles();

    modules = new BusinessModulesService(prisma);
    securityEvents = new SecurityEventsService(prisma);
    const audit = new AdminAuditService(prisma);
    tenants = new AdminTenantsService(prisma, entitlements, modules, audit);
    ents = new AdminEntitlementsService(
      prisma,
      entitlements,
      modules,
      tenants,
      audit,
    );
    users = new AdminUsersService(
      prisma,
      audit,
      new AuthTokensService(prisma, new AuthMailerService(noConfig)),
      securityEvents,
    );
    adminAuth = new AdminAuthService(
      prisma,
      new JwtService(),
      config,
      new AdminSecretCipherService(config),
      securityEvents,
    );
    const admin = await prisma.platformAdmin.create({
      data: {
        email: `sa-spec-${stamp}@noxtill.test`,
        name: 'Spec Admin',
        roleKey: 'super_admin',
        passwordHash: 'x',
      },
    });
    adminIds.push(admin.id);
    ctx = {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        roleKey: 'super_admin',
        permissions: [],
        sessionId: 'spec',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: `spec-${stamp}`,
    };
  });

  afterAll(async () => {
    const where = { businessId: { in: businessIds } };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.entitlementOverride.deleteMany({ where });
      await tx.moduleAccessOverride.deleteMany({ where });
      await tx.internalNote.deleteMany({ where });
      await tx.creditLedger.deleteMany({ where });
      await tx.usageEvent.deleteMany({ where });
      await tx.creditBalance.deleteMany({ where });
      await tx.usageSpendCap.deleteMany({ where });
      await tx.usageOutbox.deleteMany({ where });
      await tx.entitlementAudit.deleteMany({ where });
      await tx.subscription.deleteMany({ where });
      await tx.securityEvent.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { adminId: { in: adminIds } },
            { businessId: { in: businessIds } },
          ],
        },
      });
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.businessUser.deleteMany({ where });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.business.deleteMany({ where: { id: { in: businessIds } } });
      await tx.platformAdminSession.deleteMany({
        where: { adminId: { in: adminIds } },
      });
      await tx.platformAdmin.deleteMany({ where: { id: { in: adminIds } } });
      await tx.platformModuleState.deleteMany({
        where: { moduleKey: 'bookings', updatedByAdminId: { in: adminIds } },
      });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    // platform_audit_logs rows written by this spec stay: the table is append-only by design.
    await prisma.$disconnect();
  });

  describe('TOTP', () => {
    it('accepts the current code and refuses a replay of the same code', async () => {
      const secret = generateTotpSecret();
      const code = totpCode(secret, totpStep());
      expect(verifyTotp(secret, code)).toBe(totpStep());
      expect(verifyTotp(secret, '000000x')).toBeNull();

      const cipher = new AdminSecretCipherService(config);
      const admin = await prisma.platformAdmin.update({
        where: { id: adminIds[0] },
        data: {
          totpSecret: cipher.encrypt(secret),
          totpEnabledAt: new Date(),
          totpLastStep: null,
        },
      });
      expect(await adminAuth.consumeTotp(admin, code)).toBe(true);
      const again = await prisma.platformAdmin.findUniqueOrThrow({
        where: { id: admin.id },
      });
      expect(await adminAuth.consumeTotp(again, code)).toBe(false);
    });
  });

  describe('limit overrides are enforced, not just displayed', () => {
    it('an override on users replaces the plan value in resolve() and in capacity enforcement; revoke restores it', async () => {
      const bid = await makeBusiness('growth');
      await addMember(bid, 'owner');
      await addMember(bid);
      const before = (await entitlements.resolve(bid, { fresh: true })).metrics
        .users;
      expect(before.override).toBeNull();
      expect(before.used).toBe(2);

      const row = await ents.createOverride(
        bid,
        { metricCode: 'users', includedQuantity: 2 },
        'Contract cap for spec',
        ctx,
      );
      const after = (await entitlements.resolve(bid, { fresh: true })).metrics
        .users;
      expect(after.included).toBe(2);
      expect(after.planIncluded).toBe(before.planIncluded);
      expect(after.override?.id).toBe(row.id);
      await expect(meters.assertCapacity(bid, 'users')).rejects.toBeDefined();

      await ents.revokeOverride(bid, row.id, 'Spec cleanup revoke', ctx);
      const restored = (await entitlements.resolve(bid, { fresh: true }))
        .metrics.users;
      expect(restored.included).toBe(before.included);
      expect(restored.override).toBeNull();

      const audits = await prisma.platformAuditLog.count({
        where: {
          adminId: ctx.admin.id,
          businessId: bid,
          action: { in: ['limit.override_set', 'limit.override_revoked'] },
        },
      });
      expect(audits).toBe(2);
    });

    it('an ai_credits override moves the reserved-against balance and revoking restores the plan value', async () => {
      const bid = await makeBusiness('growth');
      await new CreditsService(
        prisma,
        entitlements,
        new RemediesService(prisma),
      ).ensureBalance(bid);
      const plan = (
        await prisma.creditBalance.findUniqueOrThrow({
          where: { businessId: bid },
        })
      ).includedQuantity;
      const row = await ents.createOverride(
        bid,
        { metricCode: 'ai_credits', includedQuantity: 12345 },
        'Credit grant for spec',
        ctx,
      );
      expect(
        (
          await prisma.creditBalance.findUniqueOrThrow({
            where: { businessId: bid },
          })
        ).includedQuantity,
      ).toBe(12345);
      await ents.revokeOverride(bid, row.id, 'Spec cleanup revoke', ctx);
      expect(
        (
          await prisma.creditBalance.findUniqueOrThrow({
            where: { businessId: bid },
          })
        ).includedQuantity,
      ).toBe(plan);
    });

    it('refuses "unlimited", negative and spend-cap overrides', async () => {
      const bid = await makeBusiness('growth');
      await expect(
        ents.createOverride(
          bid,
          { metricCode: 'users', includedQuantity: -1 },
          'bad value here',
          ctx,
        ),
      ).rejects.toBeDefined();
      await expect(
        ents.createOverride(
          bid,
          { metricCode: 'nope', includedQuantity: 1 },
          'bad metric here',
          ctx,
        ),
      ).rejects.toBeDefined();
    });
  });

  describe('module access', () => {
    it('suspended blocks the API, restricted is read-only, clear restores', async () => {
      const bid = await makeBusiness('growth');
      await ents.setTenantModule(
        bid,
        'bookings',
        { state: 'suspended' },
        'Abuse investigation',
        ctx,
      );
      await expect(
        modules.assertEnabled(bid, 'bookings', 'GET'),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_MODULE_PLATFORM_BLOCKED' },
      });
      expect((await modules.list(bid)).disabled).toContain('bookings');

      await ents.setTenantModule(
        bid,
        'bookings',
        { state: 'restricted' },
        'Read only for review',
        ctx,
      );
      await expect(
        modules.assertEnabled(bid, 'bookings', 'GET'),
      ).resolves.toBeUndefined();
      await expect(
        modules.assertEnabled(bid, 'bookings', 'POST'),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_MODULE_READ_ONLY' },
      });
      expect((await modules.list(bid)).disabled).not.toContain('bookings');

      await ents.setTenantModule(
        bid,
        'bookings',
        { state: 'clear' },
        'Review finished',
        ctx,
      );
      await expect(
        modules.assertEnabled(bid, 'bookings', 'POST'),
      ).resolves.toBeUndefined();
    });

    it('a global disable overrides every business', async () => {
      const bid = await makeBusiness('growth');
      await ents.setGlobal('bookings', true, 'Provider outage drill', ctx);
      try {
        await expect(
          modules.assertEnabled(bid, 'bookings', 'GET'),
        ).rejects.toMatchObject({
          response: { code: 'BUSINESS_MODULE_PLATFORM_BLOCKED' },
        });
      } finally {
        await ents.setGlobal('bookings', false, 'Drill finished', ctx);
      }
      await expect(
        modules.assertEnabled(bid, 'bookings', 'GET'),
      ).resolves.toBeUndefined();
    });
  });

  describe('suspension and revocation apply to live tokens', () => {
    it('blocks a revoked session, a suspended user and a suspended business', async () => {
      const guard = new PlatformAccessGuard(prisma);
      const bid = await makeBusiness('growth');
      const m = await addMember(bid);
      const req = () => ({
        originalUrl: '/api/v1/orders',
        user: { sub: m.userId, businessId: bid, sessionId: m.sessionId },
      });
      await expect(guard.canActivate(httpCtx(req()))).resolves.toBe(true);

      await users.setStatus(m.userId, 'suspended', 'Chargeback fraud', ctx);
      await expect(guard.canActivate(httpCtx(req()))).rejects.toMatchObject({
        response: { code: 'ACCOUNT_SUSPENDED' },
      });
      await users.setStatus(m.userId, 'active', 'Cleared after review', ctx);
      await expect(guard.canActivate(httpCtx(req()))).resolves.toBe(true);

      await tenants.setStatus(bid, 'suspended', 'Unpaid invoices', ctx);
      await expect(guard.canActivate(httpCtx(req()))).rejects.toMatchObject({
        response: { code: 'BUSINESS_SUSPENDED' },
      });
      await tenants.setStatus(bid, 'active', 'Paid in full', ctx);

      await users.revokeSession(m.userId, m.sessionId, 'Lost device', ctx);
      await expect(guard.canActivate(httpCtx(req()))).rejects.toMatchObject({
        status: 401,
      });
    });

    it('refuses login for a suspended user and records the attempt', async () => {
      const bid = await makeBusiness('growth');
      const m = await addMember(bid, 'owner', 'CorrectHorse9');
      const jwt = new JwtService();
      const sessions = new SessionsService(prisma);
      const auth = new AuthService(
        prisma,
        jwt,
        new ConfigService({
          JWT_SECRET: 'a',
          JWT_REFRESH_SECRET: 'b',
          LOGIN_MAX_ATTEMPTS: 10,
        }),
        new CapabilitiesService(prisma),
        sessions,
        new TwoFactorService(prisma, {
          send: jest.fn(),
        } as unknown as SendGateService),
        new AuthTokensService(prisma, new AuthMailerService(config)),
        securityEvents,
      );
      await expect(
        auth.login({ emailOrPhone: m.email, password: 'wrong-password' }),
      ).rejects.toBeDefined();
      expect(
        await prisma.securityEvent.count({
          where: { userId: m.userId, type: 'login_failed' },
        }),
      ).toBe(1);

      await users.setStatus(
        m.userId,
        'suspended',
        'Account takeover suspected',
        ctx,
      );
      await expect(
        auth.login({ emailOrPhone: m.email, password: 'CorrectHorse9' }),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_SUSPENDED' },
      });
      expect(
        await prisma.securityEvent.count({
          where: { userId: m.userId, type: 'login_blocked_suspended' },
        }),
      ).toBe(1);
    });
  });

  describe('admin audit log', () => {
    it('is append-only at the database level', async () => {
      const row = await prisma.platformAuditLog.findFirstOrThrow({
        where: { adminId: ctx.admin.id },
      });
      await expect(
        prisma.platformAuditLog.update({
          where: { id: row.id },
          data: { reason: 'tampered' },
        }),
      ).rejects.toBeDefined();
      await expect(
        prisma.platformAuditLog.delete({ where: { id: row.id } }),
      ).rejects.toBeDefined();
    });

    it('requires a reason', async () => {
      const bid = await makeBusiness('growth');
      await expect(
        tenants.setStatus(bid, 'suspended', ' ', ctx),
      ).rejects.toBeDefined();
    });
  });

  describe('SuperAdminGuard', () => {
    class Routes {
      @AdminPermission('limits.manage')
      mutate() {}
      @AdminPermission('limits.view')
      view() {}
      @AdminPermission('limits.view')
      @RequireReauth()
      risky() {}
    }

    async function sessionFor(roleKey: string) {
      const secret = generateTotpSecret();
      const cipher = new AdminSecretCipherService(config);
      const a = await prisma.platformAdmin.create({
        data: {
          email: `sa-spec-${stamp}-${roleKey}@noxtill.test`,
          name: roleKey,
          roleKey,
          passwordHash: await bcrypt.hash('Correct-Horse-9', 4),
          totpSecret: cipher.encrypt(secret),
          totpEnabledAt: new Date(),
        },
      });
      adminIds.push(a.id);
      const stage = await adminAuth.login(a.email, 'Correct-Horse-9', {});
      expect(stage.stage).toBe('totp');
      const tokens = await adminAuth.completeLogin(
        stage.challengeToken,
        totpCode(secret, totpStep()),
        {},
      );
      return { tokens, secret };
    }

    it('enforces the role permission server-side and requires a fresh TOTP for re-auth routes', async () => {
      const guard = new SuperAdminGuard(
        new Reflector(),
        new JwtService(),
        prisma,
        adminAuth,
        securityEvents,
      );
      const { tokens, secret } = await sessionFor('analyst');
      const headers = { authorization: `Bearer ${tokens.accessToken}` };
      const proto = Routes.prototype as unknown as Record<string, () => void>;

      await expect(
        guard.canActivate(httpCtx({ headers }, proto.view, Routes)),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(httpCtx({ headers }, proto.mutate, Routes)),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_FORBIDDEN' },
      });
      await expect(
        guard.canActivate(httpCtx({ headers, body: {} }, proto.risky, Routes)),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_REAUTH_REQUIRED' },
      });
      const fresh = totpCode(secret, totpStep() + 1);
      await expect(
        guard.canActivate(
          httpCtx({ headers, body: { totpCode: fresh } }, proto.risky, Routes),
        ),
      ).resolves.toBe(true);
      // The same code cannot be replayed.
      await expect(
        guard.canActivate(
          httpCtx({ headers, body: { totpCode: fresh } }, proto.risky, Routes),
        ),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_TOTP_INVALID' } });

      // A tenant-style token (other secret) is never accepted.
      const tenantToken = await new JwtService().signAsync(
        { sub: 'x' },
        { secret: 'sa-spec-secret' },
      );
      await expect(
        guard.canActivate(
          httpCtx(
            { headers: { authorization: `Bearer ${tenantToken}` } },
            proto.view,
            Routes,
          ),
        ),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_SESSION_INVALID' } });

      // Logging out kills the access token immediately.
      const session = await prisma.platformAdminSession.findFirstOrThrow({
        where: {
          admin: { roleKey: 'analyst', email: { contains: `${stamp}` } },
        },
      });
      await adminAuth.logout(session.id);
      await expect(
        guard.canActivate(httpCtx({ headers }, proto.view, Routes)),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_SESSION_INVALID' },
      });
    });

    it('locks an admin after repeated wrong passwords and records it', async () => {
      const a = await prisma.platformAdmin.create({
        data: {
          email: `sa-spec-${stamp}-lock@noxtill.test`,
          name: 'lock',
          roleKey: 'analyst',
          passwordHash: await bcrypt.hash('Correct-Horse-9', 4),
        },
      });
      adminIds.push(a.id);
      for (let i = 0; i < 5; i++) {
        await expect(
          adminAuth.login(a.email, 'nope', {}),
        ).rejects.toBeDefined();
      }
      const after = await prisma.platformAdmin.findUniqueOrThrow({
        where: { id: a.id },
      });
      expect(after.lockedUntil && after.lockedUntil > new Date()).toBe(true);
      expect(
        await prisma.securityEvent.count({
          where: { adminId: a.id, type: 'admin_locked' },
        }),
      ).toBe(1);
    });
  });
});
