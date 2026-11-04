jest.mock('../common/pdf/pdf-renderer.service', () => ({ PdfRendererService: jest.fn() }));
// archiver is ESM-only and breaks ts-jest's CommonJS transform; the hub never builds a ZIP.
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from '../auth/sessions.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SystemRoleOverridesService } from '../roles/system-role-overrides.service';
import type { BackupService } from '../exports/backup.service';
import type { S3Service } from '../common/storage/s3.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES, SYSTEM_ROLE_CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SettingsHubService } from './hub.service';
import type { HubCtx } from './hub.core';

class FakeCls {
  private store: Record<string, unknown> = {};
  get<T>(k: string): T {
    return this.store[k] as T;
  }
}

async function expectAppExceptionCode(
  operation: Promise<unknown>,
  code: string,
) {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppException);
  const response =
    caught instanceof AppException ? caught.getResponse() : null;
  expect(response).toHaveProperty('code', code);
}

describe('SettingsHubService', () => {
  let prisma: PrismaService;
  let hub: SettingsHubService;
  let businessId: string;
  let otherBusinessId: string;
  let ownerId: string;
  let managerId: string;
  const roles = {
    update: jest
      .fn<Promise<void>, [string, string, string[]]>()
      .mockResolvedValue(undefined),
  };
  const notifications = { getPreferenceMatrix: jest.fn().mockResolvedValue([]), setPreferences: jest.fn().mockResolvedValue([]) };

  const user = (sub: string, role: Role, sessionId?: string): AuthenticatedUser => ({
    sub,
    businessId,
    role,
    capabilities: SYSTEM_ROLE_CAPABILITIES[role],
    sessionId,
  });
  const ctxOf = (sub: string, role: Role, sessionId?: string): Promise<HubCtx> => hub.ctxFor(user(sub, role, sessionId));

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const fakeCls = new FakeCls() as unknown as ClsService;
    const capabilities = new CapabilitiesService(prisma);
    hub = new SettingsHubService(
      prisma,
      fakeCls,
      { get: () => undefined } as unknown as ConfigService,
      capabilities,
      notifications as unknown as NotificationsService,
      new SessionsService(prisma),
      roles as unknown as SystemRoleOverridesService,
      {} as S3Service,
      new PoliciesService(prisma, fakeCls, capabilities),
      {} as BackupService,
    );
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: 'Hub Biz', slug: `hub-${stamp}`, timezone: 'UTC', currency: 'USD' } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: 'Other Hub Biz', slug: `hub-other-${stamp}` } })).id;
    ownerId = (await prisma.user.create({ data: { name: 'Hub Owner', phone: `+1601${String(stamp).slice(-7)}`, passwordHash: 'x' } })).id;
    managerId = (await prisma.user.create({ data: { name: 'Hub Manager', phone: `+1602${String(stamp).slice(-7)}`, passwordHash: 'x' } })).id;
    await prisma.businessUser.create({ data: { businessId, userId: ownerId, role: Role.owner } });
    await prisma.businessUser.create({ data: { businessId, userId: managerId, role: Role.manager } });
  });

  afterAll(async () => {
    await prisma.aiCallLog.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    for (const id of [businessId, otherBusinessId]) {
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.settingPin.deleteMany({ where: { businessId: id } });
      await prisma.roleCapabilityOverride.deleteMany({ where: { businessId: id } });
      await prisma.apiKey.deleteMany({ where: { businessId: id } });
      await prisma.businessUser.deleteMany({ where: { businessId: id } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: [ownerId, managerId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, managerId] } } });
    await prisma.$disconnect();
  });

  it('lists every section, with health badges only where something is genuinely wrong', async () => {
    const cats = await hub.categories(await ctxOf(ownerId, Role.owner));
    expect(cats.map((c) => c.key)).toEqual(expect.arrayContaining(['general', 'team', 'security', 'tax', 'notifications', 'audit']));
    // No phone/address on this business, and no two-factor: both are real, nameable problems.
    expect(cats.find((c) => c.key === 'business')?.badge).toBe('1');
    expect(cats.find((c) => c.key === 'security')?.badge).toBe('1');
    expect(cats.find((c) => c.key === 'general')?.badge).toBeNull();
  });

  it('refuses the Settings hub to a plain staff member', async () => {
    const staff: AuthenticatedUser = { sub: managerId, businessId, role: Role.staff, capabilities: [] };
    await expect(hub.ctxFor(staff)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads real values, and marks a row locked when the caller may not edit it', async () => {
    const owner = await hub.detail('tax', await ctxOf(ownerId, Role.owner));
    const manager = await hub.detail('tax', await ctxOf(managerId, Role.manager));
    const day = (d: typeof owner) => d.groups.flatMap((g) => g.rows).find((r) => r.key === 'tax-filing-day')!;
    expect(day(owner)).toMatchObject({ editable: true, value: '15th of each month' });
    expect(day(manager)).toMatchObject({ editable: false, locked: 'Only the owner can change this.' });
  });

  it('exposes BI thresholds and simulation defaults as editable business policies', async () => {
    const owner = await ctxOf(ownerId, Role.owner);
    const manager = await ctxOf(managerId, Role.manager);
    const detail = await hub.detail('business-intelligence', owner);
    const rows = detail.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        'bi-confidence-review-below',
        'bi-confidence-high-at',
        'bi-impact-alert-threshold',
        'bi-metric-registry',
        'bi-approval-policy',
        'bi-retention-policy',
        'bi-freshness-policy',
        'bi-simulation-price-default',
        'bi-simulation-stock-default',
        'bi-simulation-staff-default',
        'bi-simulation-marketing-default',
      ]),
    );
    expect(
      rows.find((row) => row.key === 'bi-impact-alert-threshold'),
    ).toMatchObject({ editable: true, value: 'No threshold' });
    expect(rows.find((row) => row.key === 'bi-metric-registry')).toMatchObject({
      value: 'All BI references resolve',
    });
    expect(
      rows.find((row) => row.key === 'bi-freshness-policy')?.value,
    ).toMatch(/^Dashboard cache · \d+ seconds$/);
    expect(
      (await hub.detail('business-intelligence', manager)).groups
        .flatMap((group) => group.rows)
        .find((row) => row.key === 'bi-impact-alert-threshold'),
    ).toMatchObject({ editable: true, value: 'No threshold' });

    await hub.saveChanges(owner, [
      {
        category: 'business-intelligence',
        rowKey: 'bi-impact-alert-threshold',
        value: 125.5,
      },
      {
        category: 'business-intelligence',
        rowKey: 'bi-confidence-review-below',
        value: 60,
      },
    ]);
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.policies).toMatchObject({
      'bi.insightImpactAlertThreshold': 125.5,
      'bi.confidenceReviewBelow': 60,
    });
    await expect(
      hub.saveChanges(owner, [
        {
          category: 'business-intelligence',
          rowKey: 'bi-confidence-review-below',
          value: 101,
        },
      ]),
    ).rejects.toBeInstanceOf(AppException);

    await hub.resetRow(
      owner,
      'business-intelligence',
      'bi-impact-alert-threshold',
    );
    expect(
      await hub.rowHistory(
        owner,
        'business-intelligence',
        'bi-impact-alert-threshold',
      ),
    ).toHaveLength(2);
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .policies,
    ).toMatchObject({ 'bi.insightImpactAlertThreshold': null });
  });

  it('shows tenant-scoped specialist AI requests counted against each monthly cap', async () => {
    const now = new Date();
    const priorMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12),
    );
    await prisma.specialistAgentAiRequest.createMany({
      data: [
        {
          businessId,
          agentKey: 'inventory_intelligence',
          state: 'provider_completed',
          createdAt: now,
        },
        {
          businessId,
          agentKey: 'inventory_intelligence',
          state: 'provider_failed',
          createdAt: priorMonth,
        },
        {
          businessId,
          agentKey: 'seo_autopilot',
          state: 'reserved',
          reservedCostUsd: 0.0123,
          createdAt: now,
        },
        {
          businessId: otherBusinessId,
          agentKey: 'inventory_intelligence',
          state: 'provider_completed',
          createdAt: now,
        },
      ],
    });
    await prisma.aiCallLog.createMany({
      data: [
        {
          businessId,
          kind: 'inventory_agent',
          inputTokens: 1000,
          outputTokens: 500,
          estimatedCostUsd: 0.0035,
          createdAt: now,
        },
        {
          businessId: otherBusinessId,
          kind: 'inventory_agent',
          inputTokens: 100_000,
          outputTokens: 100_000,
          estimatedCostUsd: 0.75,
          createdAt: now,
        },
      ],
    });

    const detail = await hub.detail('ai', await ctxOf(ownerId, Role.owner));
    const rows = detail.groups.flatMap((group) => group.rows);
    expect(
      rows.find((row) => row.key === 'specialist-agent-inventory-monthly-requests'),
    ).toMatchObject({ value: 'No limit · 1 counted this month', editable: true });
    expect(
      rows.find((row) => row.key === 'specialist-agent-seo-monthly-requests')?.value,
    ).toBe('No limit · 1 counted this month');
    expect(
      rows.find((row) => row.key === 'specialist-agent-finance-monthly-requests')?.value,
    ).toBe('No limit · 0 counted this month');
    expect(
      rows.find((row) => row.key === 'specialist-agent-inventory-monthly-spend'),
    ).toMatchObject({ value: 'No cap · $0.0035 logged + reserved this month', editable: true });
    expect(
      rows.find((row) => row.key === 'specialist-agent-seo-monthly-spend')?.value,
    ).toBe('No cap · $0.0123 logged + reserved this month');
  });

  it('exposes and validates specialist per-run request, action, token, input and Commerce tool ceilings', async () => {
    const owner = await ctxOf(ownerId, Role.owner);
    const getRow = async () =>
      (await hub.detail('ai', owner)).groups
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.key === 'specialist-agent-provider-requests-per-run');

    expect(await getRow()).toMatchObject({
      value: '10 requests / run',
      editable: true,
    });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-provider-requests-per-run',
      value: 1,
    }])).toEqual({ saved: 1 });
    expect(await getRow()).toMatchObject({ value: '1 request / run' });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-provider-requests-per-run',
      value: 2,
    }])).toEqual({ saved: 1 });
    expect(await getRow()).toMatchObject({ value: '2 requests / run' });
    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-provider-requests-per-run',
      value: 0,
    }])).rejects.toBeInstanceOf(AppException);

    const getCommerceToolLimitRow = async () =>
      (await hub.detail('ai', owner)).groups
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.key === 'specialist-agent-commerce-read-tools-per-run');
    expect(await getCommerceToolLimitRow()).toMatchObject({
      value: '3 read-tool calls / run',
      editable: true,
    });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-commerce-read-tools-per-run',
      value: 1,
    }])).toEqual({ saved: 1 });
    expect(await getCommerceToolLimitRow()).toMatchObject({
      value: '1 read-tool call / run',
    });
    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-commerce-read-tools-per-run',
      value: 0,
    }])).rejects.toBeInstanceOf(AppException);

    const getActionLimitRow = async () =>
      (await hub.detail('ai', owner)).groups
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.key === 'specialist-agent-actions-per-run');
    expect(await getActionLimitRow()).toMatchObject({
      value: '10 actions / run',
      editable: true,
    });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-actions-per-run',
      value: 1,
    }])).toEqual({ saved: 1 });
    expect(await getActionLimitRow()).toMatchObject({ value: '1 action / run' });
    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-actions-per-run',
      value: 0,
    }])).rejects.toBeInstanceOf(AppException);

    const getOutputTokenRow = async () =>
      (await hub.detail('ai', owner)).groups
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.key === 'specialist-agent-output-tokens-per-request');
    expect(await getOutputTokenRow()).toMatchObject({
      value: '1024 output tokens / request',
      editable: true,
    });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-output-tokens-per-request',
      value: 256,
    }])).toEqual({ saved: 1 });
    expect(await getOutputTokenRow()).toMatchObject({
      value: '256 output tokens / request',
    });
    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-output-tokens-per-request',
      value: 127,
    }])).rejects.toBeInstanceOf(AppException);

    const getInputBytesRow = async () =>
      (await hub.detail('ai', owner)).groups
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.key === 'specialist-agent-input-bytes-per-request');
    expect(await getInputBytesRow()).toMatchObject({
      value: '1,048,576 bytes / request',
      editable: true,
    });
    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-input-bytes-per-request',
      value: 8192,
    }])).toEqual({ saved: 1 });
    expect(await getInputBytesRow()).toMatchObject({
      value: '8,192 bytes / request',
    });
    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'specialist-agent-input-bytes-per-request',
      value: 4095,
    }])).rejects.toBeInstanceOf(AppException);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
  }, 15000);

  it('exposes and validates the Customer Agent retention threshold setting', async () => {
    const owner = await ctxOf(ownerId, Role.owner);
    const detail = await hub.detail('ai', owner);
    const row = detail.groups.flatMap((group) => group.rows).find(
      (candidate) => candidate.key === 'customer-agent-retention-minimum-order-decline',
    );
    expect(row).toMatchObject({ value: '1 fewer order', editable: true });

    expect(await hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'customer-agent-retention-minimum-order-decline',
      value: 3,
    }])).toEqual({ saved: 1 });
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .policies,
    ).toMatchObject({ 'agents.customerRetentionMinimumOrderDecline': 3 });

    await expect(hub.saveChanges(owner, [{
      category: 'ai',
      rowKey: 'customer-agent-retention-minimum-order-decline',
      value: 0,
    }])).rejects.toBeInstanceOf(AppException);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
  });

  it('saves a change to the real field, audits before/after, and validates input', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await expectAppExceptionCode(
      hub.saveChanges(ctx, [{ category: 'general', rowKey: 'timezone', value: 'Mars/Olympus' }]),
      'SETTING_INVALID',
    );

    expect(await hub.saveChanges(ctx, [{ category: 'general', rowKey: 'timezone', value: 'Asia/Karachi' }])).toEqual({ saved: 1 });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).timezone).toBe('Asia/Karachi');

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { businessId, entity: 'setting', entityId: 'general.timezone' } });
    expect(entry.before).toMatchObject({ value: 'UTC' });
    expect(entry.after).toMatchObject({ value: 'Asia/Karachi', label: 'Timezone' });
    expect(entry.actorUserId).toBe(ownerId);
  });

  it('an unchanged value is not a change and writes nothing', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    const before = await prisma.auditLog.count({ where: { businessId, entityId: 'general.timezone' } });
    expect(await hub.saveChanges(ctx, [{ category: 'general', rowKey: 'timezone', value: 'Asia/Karachi' }])).toEqual({ saved: 0 });
    expect(await prisma.auditLog.count({ where: { businessId, entityId: 'general.timezone' } })).toBe(before);
  });

  it('history is append-only, the latest entry is current, and restoring applies an earlier value as a new change', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await hub.saveChanges(ctx, [{ category: 'general', rowKey: 'timezone', value: 'Europe/London' }]);
    let history = await hub.rowHistory(ctx, 'general', 'timezone');
    expect(history.map((h) => h.current)).toEqual([true, false]);
    expect(history[0].change).toContain('Europe/London');

    await hub.restore(ctx, 'general', 'timezone', history[1].id);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).timezone).toBe('Asia/Karachi');
    history = await hub.rowHistory(ctx, 'general', 'timezone');
    expect(history).toHaveLength(3);
    expect(history[0].change).toMatch(/^Restored/);
  });

  it('reset returns a setting to its real default and is audited as a reset', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await hub.saveChanges(ctx, [{ category: 'general', rowKey: 'locale', value: 'fr' }]);
    await hub.resetRow(ctx, 'general', 'locale');
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).locale).toBe('en');
    expect((await prisma.auditLog.findFirstOrThrow({ where: { businessId, entityId: 'general.locale' }, orderBy: { createdAt: 'desc' } })).action).toBe('setting.reset');
    await expectAppExceptionCode(
      hub.resetRow(ctx, 'general', 'timezone'),
      'SETTING_INVALID',
    );
  });

  it('refuses a change the caller lacks permission for, server-side', async () => {
    const manager = await ctxOf(managerId, Role.manager);
    await expect(hub.saveChanges(manager, [{ category: 'tax', rowKey: 'tax-filing-day', value: 20 }])).rejects.toBeInstanceOf(ForbiddenException);
    // A manager holds business_profile.manage, so this one is allowed.
    expect(await hub.saveChanges(manager, [{ category: 'business', rowKey: 'phone', value: '+15550001' }])).toEqual({ saved: 1 });
  });

  it('rejects out-of-range numbers before writing', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await expectAppExceptionCode(
      hub.saveChanges(ctx, [{ category: 'tax', rowKey: 'tax-rate', value: 150 }]),
      'SETTING_INVALID',
    );
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).taxRate.toString()).toBe('0');
  });

  it('changing who holds a sensitive permission edits the real Manager/Staff roles', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    roles.update.mockClear();
    await hub.saveChanges(ctx, [{ category: 'team', rowKey: `cap:${CAPABILITIES.PROFIT_VIEW}`, value: 'owner_manager_staff' }]);
    const staffCall = roles.update.mock.calls.find((c) => c[1] === Role.staff);
    expect(staffCall?.[2]).toContain(CAPABILITIES.PROFIT_VIEW);
    // Manager already held it, so its role is left alone.
    expect(roles.update.mock.calls.find((c) => c[1] === Role.manager)).toBeUndefined();
  });

  it('search returns only settings the caller could open, never rows locked to a higher role', async () => {
    const owner = await hub.search(await ctxOf(ownerId, Role.owner), 'filing reminder');
    const manager = await hub.search(await ctxOf(managerId, Role.manager), 'filing reminder');
    expect(owner.map((r) => r.rowKey)).toContain('tax-filing-day');
    expect(manager.map((r) => r.rowKey)).not.toContain('tax-filing-day');
    expect(await hub.search(await ctxOf(ownerId, Role.owner), 'x')).toEqual([]);
  });

  it('health reflects a real permission override, and clears when it is undone', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await prisma.roleCapabilityOverride.create({ data: { businessId, role: Role.staff, capabilities: [CAPABILITIES.PROFIT_VIEW] } });
    (hub as unknown as { healthCache: null }).healthCache = null;
    expect((await hub.healthItems(ctx)).map((i) => i.key)).toContain('staff-profit');
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    (hub as unknown as { healthCache: null }).healthCache = null;
    expect((await hub.healthItems(ctx)).map((i) => i.key)).not.toContain('staff-profit');
  });

  it('sessions: can sign out another session but not the current one, and only your own', async () => {
    const current = await prisma.session.create({ data: { userId: ownerId, businessId, refreshTokenHash: 'a', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537' } });
    const other = await prisma.session.create({ data: { userId: ownerId, businessId, refreshTokenHash: 'b', userAgent: 'Mozilla/5.0 (iPhone) Safari/604' } });
    const stranger = await prisma.session.create({ data: { userId: managerId, businessId, refreshTokenHash: 'c' } });
    const ctx = await ctxOf(ownerId, Role.owner, current.id);

    const detail = await hub.detail('sessions', ctx);
    const rows = detail.groups[0].rows;
    expect(rows.find((r) => r.key === `session:${current.id}`)?.value).toBe('This device');
    expect(rows.find((r) => r.key === `session:${other.id}`)?.control).toMatchObject({ type: 'action' });
    expect(rows.find((r) => r.key === `session:${stranger.id}`)).toBeUndefined();

    await expectAppExceptionCode(
      hub.runAction(ctx, `session:${current.id}`),
      'SETTING_INVALID',
    );
    await hub.runAction(ctx, `session:${other.id}`);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: other.id } })).revokedAt).not.toBeNull();
    await expect(hub.runAction(ctx, `session:${stranger.id}`)).rejects.toBeDefined();
    expect((await prisma.session.findUniqueOrThrow({ where: { id: stranger.id } })).revokedAt).toBeNull();
  });

  it('API keys: revoking needs the permission and never reaches another business’s key', async () => {
    const mine = await prisma.apiKey.create({ data: { businessId, name: 'Mine', keyHash: `h-${Date.now()}-1`, keyPrefix: 'ntk_mine', scopes: [] } });
    const theirs = await prisma.apiKey.create({ data: { businessId: otherBusinessId, name: 'Theirs', keyHash: `h-${Date.now()}-2`, keyPrefix: 'ntk_their', scopes: [] } });
    const owner = await ctxOf(ownerId, Role.owner);
    await expect(hub.runAction(owner, `apikey:${theirs.id}`)).rejects.toBeDefined();
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: theirs.id } })).revokedAt).toBeNull();
    await hub.runAction(owner, `apikey:${mine.id}`);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: mine.id } })).revokedAt).not.toBeNull();
    await expect(hub.runAction(await ctxOf(managerId, Role.manager), `apikey:${mine.id}`)).rejects.toBeDefined();
  });

  it('pins are per user, and Settings Home lists them', async () => {
    const owner = await ctxOf(ownerId, Role.owner);
    expect(await hub.pin(owner, 'general', 'timezone')).toEqual({ pinned: true });
    expect((await hub.home(owner)).pinned.map((p) => p.rowKey)).toContain('timezone');
    expect((await hub.home(await ctxOf(managerId, Role.manager))).pinned).toEqual([]);
    expect(await hub.pin(owner, 'general', 'timezone')).toEqual({ pinned: false });
  });

  it('never shows or restores another business’s history', async () => {
    await prisma.auditLog.create({ data: { businessId: otherBusinessId, actorUserId: ownerId, action: 'setting.changed', entity: 'setting', entityId: 'general.timezone', before: { value: 'UTC' }, after: { value: 'Asia/Tokyo', display: 'Asia/Tokyo' } } });
    const ctx = await ctxOf(ownerId, Role.owner);
    const history = await hub.rowHistory(ctx, 'general', 'timezone');
    expect(JSON.stringify(history)).not.toContain('Asia/Tokyo');
    const foreign = await prisma.auditLog.findFirstOrThrow({ where: { businessId: otherBusinessId } });
    await expect(hub.restore(ctx, 'general', 'timezone', foreign.id)).rejects.toBeDefined();
  });

  it('answers “who can see profit” from the real role permissions', async () => {
    const a = await hub.ask(await ctxOf(ownerId, Role.owner), 'profit');
    expect(a.rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Owner', 'Manager', 'Staff']));
    await expect(hub.ask(await ctxOf(ownerId, Role.owner), 'nonsense')).rejects.toBeDefined();
  });

  it('a section reset only touches settings that have a real default', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await hub.saveChanges(ctx, [{ category: 'reviews', rowKey: 'rv-offsets', value: '2,5,9' }]);
    const r = await hub.resetCategory(ctx, 'reviews');
    expect(r.reset).toBeGreaterThanOrEqual(1);
    const rs = ((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).reviewSettings ?? {}) as { reminderDayOffsets?: number[] };
    expect(rs.reminderDayOffsets).toEqual([3, 7]);
  });
});
