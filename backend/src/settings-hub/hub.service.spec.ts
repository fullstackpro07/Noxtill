jest.mock('../common/pdf/pdf-renderer.service', () => ({ PdfRendererService: jest.fn() }));
// archiver is ESM-only and breaks ts-jest's CommonJS transform; the hub never builds a ZIP.
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

describe('SettingsHubService', () => {
  let prisma: PrismaService;
  let hub: SettingsHubService;
  let businessId: string;
  let otherBusinessId: string;
  let ownerId: string;
  let managerId: string;
  const roles = { update: jest.fn().mockResolvedValue(undefined) };
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

  it('saves a change to the real field, audits before/after, and validates input', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await expect(hub.saveChanges(ctx, [{ category: 'general', rowKey: 'timezone', value: 'Mars/Olympus' }])).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SETTING_INVALID' }) });

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
    await expect(hub.resetRow(ctx, 'general', 'timezone')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SETTING_INVALID' }) });
  });

  it('refuses a change the caller lacks permission for, server-side', async () => {
    const manager = await ctxOf(managerId, Role.manager);
    await expect(hub.saveChanges(manager, [{ category: 'tax', rowKey: 'tax-filing-day', value: 20 }])).rejects.toBeInstanceOf(ForbiddenException);
    // A manager holds business_profile.manage, so this one is allowed.
    expect(await hub.saveChanges(manager, [{ category: 'business', rowKey: 'phone', value: '+15550001' }])).toEqual({ saved: 1 });
  });

  it('rejects out-of-range numbers before writing', async () => {
    const ctx = await ctxOf(ownerId, Role.owner);
    await expect(hub.saveChanges(ctx, [{ category: 'tax', rowKey: 'tax-rate', value: 150 }])).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SETTING_INVALID' }) });
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

    await expect(hub.runAction(ctx, `session:${current.id}`)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SETTING_INVALID' }) });
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
