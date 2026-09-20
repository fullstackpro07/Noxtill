import { ForbiddenException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionsService } from '../auth/sessions.service';
import { SystemRoleOverridesService } from '../roles/system-role-overrides.service';
import { S3Service } from '../common/storage/s3.service';
import { PoliciesService, resolvePolicies } from '../common/policies/policies.service';
import { BackupService } from '../exports/backup.service';
import { personalCategories } from './categories/personal';
import { backupSummary, configConflicts } from './categories/checks';
import { DIAGNOSTIC_FIELDS } from './diagnostics';
import { resolveUiPrefs } from './ui-preferences';
import { buildRedisConnection } from '../common/queue/redis-connection.util';
import { isNotificationEvent, isNotificationChannel } from '../notifications/notification-preferences.constants';
import { CategoryDef, GroupDef, HubCtx, HubTone, HubValue, RowDef, RowState, canonicalOf, relativeTime } from './hub.core';
import { HubDeps, QueueSnapshot } from './categories/hub.deps';
import { platformCategories } from './categories/platform';
import { accessCategories, SENSITIVE_CAPS, whoHolds } from './categories/access';
import { moneyCategories } from './categories/money';
import { operationsCategories } from './categories/operations';
import { engagementCategories } from './categories/engagement';
import { intelligenceCategories } from './categories/intelligence';
import { governanceCategories, describeAudit } from './categories/governance';
import { SYSTEM_ROLE_CAPABILITIES } from '../common/capabilities/capabilities.constants';

const QUEUE_NAMES = [
  'ad-auto-pause', 'ad-stats-sync', 'trial-expiry', 'quota-reset', 'stripe-webhook', 'booking-reminders',
  'visibility-score-snapshot', 'competitive-opportunities', 'credit-balance-snapshot', 'credit-reminders',
  'customer-import', 'crm-jobs', 'health-score-snapshot', 'ai-insights', 'recurring-expenses',
  'account-zip-export', 'data-exports', 'scheduled-exports-check', 'outbound-webhook', 'low-stock-scan',
  'gmb-insights-pull', 'listings-auto-sync', 'credit-overdue-scan', 'competitor-snapshot', 'keyword-rank-check',
  'messages', 'nightly-close', 'google-sync', 'review-metrics-snapshot', 'review-reminders',
  'sentiment-analysis', 'social-post-publish', 'social-analytics-pull', 'social-webhook-events',
  'voice-recording-retention', 'webhook-events', 'backup-check',
];

/** Left-rail order within each group, matching the design. Anything not listed goes last. */
const CATEGORY_ORDER = [
  'home', 'general', 'appearance', 'language', 'business', 'branches', 'shortcuts', 'accessibility',
  'sessions', 'team', 'security',
  'billing', 'payments', 'tax', 'credit',
  'sales', 'inventory', 'bookings', 'customers',
  'marketing', 'reviews', 'inbox', 'notifications', 'sounds', 'communication',
  'automations', 'ai', 'integrations', 'api',
  'data', 'importexport', 'backup', 'reports', 'privacy', 'health', 'audit', 'support',
];

export interface HealthItem {
  key: string;
  risk: string;
  tone: 'amber' | 'red';
  title: string;
  action: string;
  category: string;
}

const invalid = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

@Injectable()
export class SettingsHubService {
  private readonly logger = new Logger(SettingsHubService.name);
  private queueCache: { at: number; value: QueueSnapshot } | null = null;
  private readonly deps: HubDeps;
  private categoriesCache: CategoryDef[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly config: ConfigService,
    private readonly capabilities: CapabilitiesService,
    notifications: NotificationsService,
    private readonly sessions: SessionsService,
    roles: SystemRoleOverridesService,
    s3: S3Service,
    policies: PoliciesService,
    private readonly backups: BackupService,
  ) {
    this.deps = { prisma, notifications, sessions, roles, s3, policies, queueSnapshot: () => this.queueSnapshot() };
  }

  // ------------------------------------------------------------------ context + registry

  async ctxFor(user: AuthenticatedUser): Promise<HubCtx> {
    if (user.role === Role.staff && (!user.capabilities || user.capabilities.length === 0) && !user.customRoleId) {
      throw new ForbiddenException('Settings are available to owners and managers.');
    }
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? user.businessId;
    const caps =
      user.role === Role.owner
        ? new Set<string>(SYSTEM_ROLE_CAPABILITIES[Role.owner])
        : new Set<string>(await this.capabilities.resolve({ businessId: user.businessId, role: user.role, customRoleId: user.customRoleId ?? null }));
    return {
      businessId,
      userId: user.sub,
      role: user.role,
      sessionId: user.sessionId,
      customRoleId: user.customRoleId ?? null,
      caps,
      isOwner: user.role === Role.owner,
      can: (c: string) => user.role === Role.owner || caps.has(c),
      now: new Date(),
    };
  }

  private registry(): CategoryDef[] {
    if (!this.categoriesCache) {
      this.categoriesCache = [
        ...platformCategories(this.deps),
        ...accessCategories(this.deps),
        ...moneyCategories(this.deps),
        ...operationsCategories(this.deps),
        ...engagementCategories(this.deps),
        ...intelligenceCategories(this.deps),
        ...governanceCategories(this.deps),
        ...personalCategories(this.deps),
      ].sort((a, b) => {
        const rank = (k: string) => {
          const i = CATEGORY_ORDER.indexOf(k);
          return i === -1 ? CATEGORY_ORDER.length : i;
        };
        return rank(a.key) - rank(b.key);
      });
    }
    return this.categoriesCache;
  }

  private category(key: string): CategoryDef {
    const c = this.registry().find((x) => x.key === key);
    if (!c) throw new NotFoundException(`Unknown settings section: ${key}`);
    return c;
  }

  private canEdit(def: RowDef, ctx: HubCtx): boolean {
    if (!def.write) return false;
    if (!def.requires) return true;
    return def.requires === 'owner' ? ctx.isOwner : ctx.can(def.requires);
  }

  private async rowsOf(group: GroupDef, ctx: HubCtx): Promise<RowDef[]> {
    return [...(group.rows ?? []), ...(group.dynamicRows ? await group.dynamicRows(ctx) : [])];
  }

  private async findRow(categoryKey: string, rowKey: string, ctx: HubCtx): Promise<RowDef> {
    const cat = this.category(categoryKey);
    for (const g of cat.groups) {
      const found = (await this.rowsOf(g, ctx)).find((r) => r.key === rowKey);
      if (found) return found;
    }
    throw new NotFoundException('That setting no longer exists.');
  }

  // ------------------------------------------------------------------ reading

  async categories(ctx: HubCtx) {
    const items = await this.healthItems(ctx);
    return this.registry().map((c) => {
      const n = items.filter((i) => i.category === c.key).length;
      return { key: c.key, label: c.label, icon: c.icon, group: c.group, badge: n > 0 ? String(n) : null };
    });
  }

  private toRow(def: RowDef, state: RowState, ctx: HubCtx, pinned: Set<string>, categoryKey: string) {
    const editable = this.canEdit(def, ctx);
    const locked = def.write && !editable ? (def.requires === 'owner' ? 'Only the owner can change this.' : 'Your role does not have permission to change this.') : null;
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      value: state.value,
      valueTone: (state.tone ?? 'neutral') as HubTone,
      scope: def.scope ?? 'Business',
      risk: def.risk ?? 'Low',
      impact: def.impact ?? null,
      effective: state.effective ?? null,
      control: def.write ? (state.control ?? null) : state.control && state.control.type === 'action' ? state.control : null,
      editable,
      locked,
      link: def.link ?? null,
      resettable: !!def.reset && editable,
      defaultLabel: def.reset?.label ?? null,
      pinned: pinned.has(`${categoryKey}|${def.key}`),
    };
  }

  async detail(categoryKey: string, ctx: HubCtx) {
    const cat = this.category(categoryKey);
    const pins = await this.prisma.settingPin.findMany({ where: { businessId: ctx.businessId, userId: ctx.userId, pinned: true } });
    const pinned = new Set(pins.map((p) => `${p.category}|${p.rowKey}`));

    const groups = await Promise.all(
      cat.groups.map(async (g) => {
        const defs = await this.rowsOf(g, ctx);
        const rows = await Promise.all(
          defs.map(async (def) => {
            try {
              return this.toRow(def, await def.state(ctx), ctx, pinned, categoryKey);
            } catch (error) {
              this.logger.warn(`Setting ${categoryKey}.${def.key} could not be read: ${(error as Error).message}`);
              return this.toRow(def, { value: 'Unavailable', tone: 'amber' }, ctx, pinned, categoryKey);
            }
          }),
        );
        const badge = g.badge ? await g.badge(ctx).catch(() => null) : null;
        return { title: g.title, hint: g.hint ?? null, badge: badge?.text ?? null, badgeTone: (badge?.tone ?? 'neutral') as HubTone, footer: g.footer ?? null, rows };
      }),
    );

    const allHealth = await this.healthItems(ctx);
    const health = categoryKey === 'home' ? allHealth : allHealth.filter((i) => i.category === categoryKey);
    const matrix = cat.matrix ? await cat.matrix(ctx) : null;
    return {
      key: cat.key,
      title: cat.title,
      icon: cat.icon,
      description: cat.description,
      affects: cat.affects,
      affectsNote: cat.affectsNote,
      help: cat.help,
      notice: cat.notice ? { text: cat.notice.text, icon: cat.notice.icon, action: cat.notice.action ?? null } : null,
      actions: (cat.actions ?? []).map((a) => ({ label: a.label, icon: a.icon, primary: !!a.primary, href: a.href ?? null, kind: a.kind })),
      groups: groups.filter((g) => g.rows.length > 0),
      health,
      matrix,
    };
  }

  // ------------------------------------------------------------------ writing

  private normalize(def: RowDef, state: RowState, value: HubValue): HubValue {
    const c = state.control;
    if (!c || c.type === 'action') throw invalid('This setting cannot be changed here.');
    if (c.type === 'toggle') {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw invalid('That is not a valid on/off value.');
    }
    if (c.type === 'number') {
      if ((value === '' || value === null) && c.nullable) return null;
      const n = Number(value);
      if (value === '' || !Number.isFinite(n)) throw invalid('Enter a number.');
      if (c.min !== undefined && n < c.min) throw invalid(`The minimum is ${c.min}.`);
      if (c.max !== undefined && n > c.max) throw invalid(`The maximum is ${c.max}.`);
      return n;
    }
    if (c.type === 'time') {
      if ((value === '' || value === null) && c.nullable) return null;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) throw invalid('Enter a time like 21:00.');
      return String(value);
    }
    if (c.type === 'select') {
      const v = String(value);
      if (!c.options.some((o) => o.value === v)) throw invalid('Choose one of the listed options.');
      return v;
    }
    void def;
    return String(value);
  }

  private async audit(ctx: HubCtx, action: string, categoryKey: string, rowKey: string, before: unknown, after: unknown) {
    await this.prisma.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorUserId: ctx.userId,
        action,
        entity: 'setting',
        entityId: `${categoryKey}.${rowKey}`,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  }

  private async apply(ctx: HubCtx, categoryKey: string, rowKey: string, raw: HubValue, action: 'setting.changed' | 'setting.reset' | 'setting.restored', reason?: string) {
    const def = await this.findRow(categoryKey, rowKey, ctx);
    if (!this.canEdit(def, ctx)) throw new ForbiddenException(def.requires === 'owner' ? 'Only the owner can change this.' : 'Your role does not have permission to change this setting.');
    const beforeState = await def.state(ctx);
    const value = this.normalize(def, beforeState, raw);
    const beforeValue = canonicalOf(beforeState);
    if (beforeValue === value && action === 'setting.changed') return false;
    await def.write!(ctx, value);
    const afterState = await def.state(ctx);
    await this.audit(ctx, action, categoryKey, rowKey, { value: beforeValue, display: beforeState.value }, { value, display: afterState.value, label: def.label, category: this.category(categoryKey).title, reason: reason ?? null });
    return true;
  }

  async saveChanges(ctx: HubCtx, changes: { category: string; rowKey: string; value: HubValue; reason?: string }[]) {
    let saved = 0;
    for (const c of changes) {
      if (c.value === undefined) throw invalid('A value is needed for every change.');
      if (await this.apply(ctx, c.category, c.rowKey, c.value, 'setting.changed', c.reason)) saved += 1;
    }
    this.healthCache = null;
    return { saved };
  }

  async resetRow(ctx: HubCtx, categoryKey: string, rowKey: string) {
    const def = await this.findRow(categoryKey, rowKey, ctx);
    if (!def.reset) throw invalid('This setting has no Noxtill default to return to.');
    await this.apply(ctx, categoryKey, rowKey, def.reset.value, 'setting.reset');
    return { ok: true as const };
  }

  async resetCategory(ctx: HubCtx, categoryKey: string) {
    const cat = this.category(categoryKey);
    let reset = 0;
    for (const g of cat.groups) {
      for (const def of await this.rowsOf(g, ctx)) {
        if (!def.reset || !this.canEdit(def, ctx)) continue;
        const state = await def.state(ctx);
        if (canonicalOf(state) === def.reset.value) continue;
        await this.apply(ctx, categoryKey, def.key, def.reset.value, 'setting.reset');
        reset += 1;
      }
    }
    return { reset };
  }

  // ------------------------------------------------------------------ history

  private historyEntries(entries: { id: string; action: string; createdAt: Date; actorUserId: string | null; before: unknown; after: unknown }[], names: Map<string, string>) {
    return entries.map((e, i) => {
      const before = (e.before ?? {}) as { display?: string };
      const after = (e.after ?? {}) as { display?: string; reason?: string | null };
      const verb = e.action === 'setting.reset' ? 'Reset to default' : e.action === 'setting.restored' ? 'Restored' : 'Changed';
      const who = e.actorUserId ? (names.get(e.actorUserId) ?? 'Unknown user') : 'System';
      return {
        id: e.id,
        change: `${verb}${before.display !== undefined ? ` from ${before.display}` : ''}${after.display !== undefined ? ` to ${after.display}` : ''}`,
        meta: `${e.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC · ${who}${after.reason ? ` · reason: ${after.reason}` : ''}`,
        restorable: i > 0,
        current: i === 0,
      };
    });
  }

  private async names(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async rowHistory(ctx: HubCtx, categoryKey: string, rowKey: string) {
    const own = this.category(categoryKey).userScoped ? { actorUserId: ctx.userId } : {};
    const entries = await this.prisma.auditLog.findMany({ where: { businessId: ctx.businessId, entity: 'setting', entityId: `${categoryKey}.${rowKey}`, ...own }, orderBy: { createdAt: 'desc' }, take: 20 });
    return this.historyEntries(entries, await this.names(entries.map((e) => e.actorUserId)));
  }

  async categoryHistory(ctx: HubCtx, categoryKey: string) {
    const own = this.category(categoryKey).userScoped ? { actorUserId: ctx.userId } : {};
    const entries = await this.prisma.auditLog.findMany({ where: { businessId: ctx.businessId, entity: 'setting', entityId: { startsWith: `${categoryKey}.` }, ...own }, orderBy: { createdAt: 'desc' }, take: 40 });
    const names = await this.names(entries.map((e) => e.actorUserId));
    return entries.map((e) => {
      const after = (e.after ?? {}) as { label?: string; display?: string };
      return { id: e.id, rowKey: e.entityId?.split('.').slice(1).join('.') ?? null, change: describeAudit(e.action, e.entity, e.after), meta: `${e.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC · ${e.actorUserId ? (names.get(e.actorUserId) ?? 'Unknown user') : 'System'}${after.display ? '' : ''}` };
    });
  }

  async restore(ctx: HubCtx, categoryKey: string, rowKey: string, entryId: string) {
    const entry = await this.prisma.auditLog.findFirst({ where: { id: entryId, businessId: ctx.businessId, entity: 'setting', entityId: `${categoryKey}.${rowKey}` } });
    if (!entry) throw new NotFoundException('That history entry was not found.');
    const after = (entry.after ?? {}) as { value?: HubValue };
    if (after.value === undefined) throw invalid('That entry has no value to restore.');
    await this.apply(ctx, categoryKey, rowKey, after.value, 'setting.restored');
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ pins + opens

  async pin(ctx: HubCtx, categoryKey: string, rowKey: string) {
    await this.findRow(categoryKey, rowKey, ctx);
    const key = { businessId_userId_category_rowKey: { businessId: ctx.businessId, userId: ctx.userId, category: categoryKey, rowKey } };
    const existing = await this.prisma.settingPin.findUnique({ where: key });
    const pinned = !(existing?.pinned ?? false);
    await this.prisma.settingPin.upsert({ where: key, create: { businessId: ctx.businessId, userId: ctx.userId, category: categoryKey, rowKey, pinned }, update: { pinned } });
    return { pinned };
  }

  async opened(ctx: HubCtx, categoryKey: string, rowKey: string) {
    const key = { businessId_userId_category_rowKey: { businessId: ctx.businessId, userId: ctx.userId, category: categoryKey, rowKey } };
    try {
      await this.prisma.settingPin.upsert({ where: key, create: { businessId: ctx.businessId, userId: ctx.userId, category: categoryKey, rowKey, opens: 1, lastOpenedAt: new Date() }, update: { opens: { increment: 1 }, lastOpenedAt: new Date() } });
    } catch {
      // Two opens racing on a brand-new row: the second simply increments the row the first created.
      await this.prisma.settingPin.updateMany({ where: { businessId: ctx.businessId, userId: ctx.userId, category: categoryKey, rowKey }, data: { opens: { increment: 1 }, lastOpenedAt: new Date() } }).catch(() => undefined);
    }
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ search

  async search(ctx: HubCtx, q: string) {
    if (q.trim().length < 2) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: { category: string; categoryLabel: string; rowKey: string; label: string; description: string }[] = [];
    for (const c of this.registry()) {
      for (const g of c.groups) {
        for (const r of g.rows ?? []) {
          if (r.requires && !(r.requires === 'owner' ? ctx.isOwner : ctx.can(r.requires))) continue;
          const hay = `${r.label} ${r.description} ${c.label} ${g.title}`.toLowerCase();
          if (terms.every((t) => hay.includes(t))) out.push({ category: c.key, categoryLabel: c.label, rowKey: r.key, label: r.label, description: r.description });
        }
      }
    }
    return out.slice(0, 20);
  }

  // ------------------------------------------------------------------ actions

  async runAction(ctx: HubCtx, actionKey: string): Promise<{ message: string; url?: string }> {
    if (actionKey === 'backup-now') {
      if (!ctx.isOwner) throw new ForbiddenException('Only the owner can start a backup.');
      const started = await this.backups.startBackup(ctx.businessId, ctx.userId);
      if (!started) throw invalid('A backup could not be started.');
      await this.audit(ctx, 'setting.action', 'backup', 'backup-now', null, { display: 'Backup started', label: 'Back up now' });
      this.healthCache = null;
      return { message: 'Backup started. It appears here as soon as it finishes.' };
    }
    if (actionKey === 'backup-download-latest') {
      if (!ctx.isOwner) throw new ForbiddenException('Only the owner can download a backup.');
      const latest = await this.backups.latestDownload(ctx.businessId);
      if (!latest) throw invalid('There is no finished backup to download yet.');
      await this.audit(ctx, 'setting.action', 'backup', 'backup-download', null, { display: 'Backup downloaded', label: 'Download the latest backup' });
      return { message: 'Your backup is downloading.', url: latest.url };
    }
    if (actionKey === 'sessions-revoke-others') {
      const r = await this.prisma.session.updateMany({ where: { userId: ctx.userId, revokedAt: null, ...(ctx.sessionId ? { id: { not: ctx.sessionId } } : {}) }, data: { revokedAt: new Date() } });
      await this.audit(ctx, 'setting.action', 'sessions', 'sessions-revoke-others', null, { display: `${r.count} sessions signed out`, label: 'Sign out all other sessions' });
      return { message: `${r.count} session${r.count === 1 ? '' : 's'} signed out.` };
    }
    if (actionKey.startsWith('session:')) {
      const id = actionKey.slice('session:'.length);
      if (id === ctx.sessionId) throw invalid('That is the session you are using right now.');
      await this.sessions.revokeOwn(ctx.userId, id);
      await this.audit(ctx, 'setting.action', 'sessions', `session`, null, { display: 'Session signed out', label: 'Sign out a session' });
      return { message: 'Session signed out.' };
    }
    if (actionKey.startsWith('apikey:')) {
      if (!ctx.can(CAPABILITIES.INTEGRATIONS_MANAGE)) throw new ForbiddenException('Your role cannot revoke API keys.');
      const id = actionKey.slice('apikey:'.length);
      const key = await this.prisma.apiKey.findFirst({ where: { id, businessId: ctx.businessId, revokedAt: null } });
      if (!key) throw new NotFoundException('That API key is already revoked or does not exist.');
      await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit(ctx, 'setting.action', 'api', `apikey`, { display: key.name }, { display: `Revoked key ${key.name}`, label: 'Revoke API key' });
      return { message: `Key “${key.name}” revoked. Anything using it stopped working.` };
    }
    throw new NotFoundException('Unknown action.');
  }

  async toggleMatrix(ctx: HubCtx, event: string, channel: string, on: boolean) {
    if (!isNotificationEvent(event) || !isNotificationChannel(channel)) throw invalid('That notification or channel is not available.');
    await this.deps.notifications.setPreferences(ctx.businessId, { userId: ctx.userId, preferences: [{ event, channel, enabled: on }] });
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ queues

  async queueSnapshot(): Promise<QueueSnapshot> {
    if (this.queueCache && Date.now() - this.queueCache.at < 30_000) return this.queueCache.value;
    const remember = (value: QueueSnapshot) => {
      this.queueCache = { at: Date.now(), value };
      return value;
    };
    const configured = !!(this.config.get<string>('REDIS_URL') || this.config.get<string>('REDIS_HOST'));
    if (!configured) return remember({ configured: false, reachable: false, queues: [] });

    // One shared connection with an error handler: an unreachable Redis must never crash the process.
    const connection = new Redis({ ...(buildRedisConnection(this.config) as object), lazyConnect: true, retryStrategy: () => null } as never);
    connection.on('error', () => undefined);
    try {
      await Promise.race([connection.connect().then(() => connection.ping()), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
    } catch {
      connection.disconnect();
      return remember({ configured: true, reachable: false, queues: [] });
    }

    const queues: QueueSnapshot['queues'] = [];
    for (const name of QUEUE_NAMES) {
      const q = new Queue(name, { connection: connection as never });
      q.on('error', () => undefined);
      try {
        const counts = await Promise.race([q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
        queues.push({ name, waiting: counts.waiting ?? 0, active: counts.active ?? 0, completed: counts.completed ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0 });
      } catch {
        // an unreadable queue is omitted rather than reported as zero
      } finally {
        await q.close().catch(() => undefined);
      }
    }
    connection.disconnect();
    return remember({ configured: true, reachable: true, queues: queues.sort((a, b) => a.name.localeCompare(b.name)) });
  }

  // ------------------------------------------------------------------ health

  private healthCache: { at: number; businessId: string; items: HealthItem[] } | null = null;

  async healthItems(ctx: HubCtx): Promise<HealthItem[]> {
    if (this.healthCache && this.healthCache.businessId === ctx.businessId && Date.now() - this.healthCache.at < 20_000) return this.healthCache.items;
    const items: HealthItem[] = [];
    const push = (i: HealthItem) => items.push(i);
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });

    const overrides = await this.prisma.roleCapabilityOverride.findMany({ where: { businessId: ctx.businessId } });
    const staffCaps = new Set<string>(((overrides.find((o) => o.role === Role.staff)?.capabilities as unknown as string[]) ?? SYSTEM_ROLE_CAPABILITIES[Role.staff]) as string[]);
    if (staffCaps.has(CAPABILITIES.PROFIT_VIEW)) push({ key: 'staff-profit', risk: 'Medium', tone: 'amber', title: 'The Staff role can see profit and margin', action: 'Review permissions', category: 'team' });
    const exposed = SENSITIVE_CAPS.filter((c) => c.key !== CAPABILITIES.PROFIT_VIEW && staffCaps.has(c.key));
    if (exposed.length) push({ key: 'staff-sensitive', risk: 'High', tone: 'red', title: `The Staff role holds ${exposed.length} sensitive permission${exposed.length === 1 ? '' : 's'} (${exposed.map((e) => e.label.toLowerCase()).slice(0, 2).join(', ')}${exposed.length > 2 ? '…' : ''})`, action: 'Review permissions', category: 'team' });

    const members = await this.prisma.businessUser.findMany({ where: { businessId: ctx.businessId, active: true }, include: { user: { select: { twoFactorEnabled: true, lockedUntil: true } } } });
    const leaders = members.filter((m) => m.role !== Role.staff);
    const without2fa = leaders.filter((m) => !m.user.twoFactorEnabled).length;
    if (without2fa > 0) push({ key: '2fa', risk: 'Security', tone: 'amber', title: `${without2fa} owner or manager account${without2fa === 1 ? ' has' : 's have'} no two-factor authentication`, action: 'Review security', category: 'security' });
    const locked = members.filter((m) => m.user.lockedUntil && m.user.lockedUntil > ctx.now).length;
    if (locked > 0) push({ key: 'locked', risk: 'Security', tone: 'amber', title: `${locked} account${locked === 1 ? ' is' : 's are'} locked after failed sign-ins`, action: 'Review security', category: 'security' });

    const needs = await this.prisma.integration.findMany({ where: { businessId: ctx.businessId, status: 'needs_attention' } });
    for (const i of needs) push({ key: `int-${i.provider}`, risk: 'Communication', tone: 'red', title: `${i.provider.replace(/_/g, ' ')} needs to be reconnected`, action: 'Reconnect', category: 'integrations' });
    const socialNeeds = await this.prisma.socialAccount.count({ where: { businessId: ctx.businessId, status: 'needs_attention' } });
    if (socialNeeds > 0) push({ key: 'social-needs', risk: 'Communication', tone: 'red', title: `${socialNeeds} social channel${socialNeeds === 1 ? ' needs' : 's need'} to be reconnected`, action: 'Reconnect', category: 'inbox' });

    if (b.msgQuota > 0 && b.msgUsed / b.msgQuota >= 0.9) push({ key: 'quota', risk: 'Operational', tone: 'amber', title: `${Math.round((b.msgUsed / b.msgQuota) * 100)}% of the monthly message quota is used`, action: 'Review plan', category: 'billing' });
    if (b.trialEndsAt && b.trialEndsAt > ctx.now && !b.stripeSubscriptionId && b.trialEndsAt.getTime() - ctx.now.getTime() < 3 * 86_400_000) push({ key: 'trial', risk: 'Billing', tone: 'amber', title: 'Your trial ends in less than 3 days', action: 'Choose a plan', category: 'billing' });
    if (!b.phone || !b.address) push({ key: 'profile', risk: 'Missing configuration', tone: 'amber', title: `Business ${!b.phone && !b.address ? 'phone and address are' : !b.phone ? 'phone is' : 'address is'} not set`, action: 'Complete profile', category: 'business' });
    if (!process.env.ANTHROPIC_API_KEY) push({ key: 'ai-provider', risk: 'Operational', tone: 'amber', title: 'No AI provider is configured, so AI features cannot run', action: 'Review AI', category: 'ai' });

    const failedRuns = await this.prisma.workflowRun.count({ where: { workflow: { businessId: ctx.businessId }, status: 'failed', createdAt: { gte: new Date(ctx.now.getTime() - 86_400_000) } } });
    if (failedRuns > 0) push({ key: 'wf-failed', risk: 'Operational', tone: 'amber', title: `${failedRuns} automation run${failedRuns === 1 ? '' : 's'} failed in the last 24 hours`, action: 'Review automations', category: 'automations' });

    for (const c of await configConflicts(this.deps, ctx)) push({ key: c.key, risk: 'Conflict', tone: 'amber', title: c.title, action: c.action, category: c.category });

    if (resolvePolicies(b).bool('backup.enabled')) {
      const s = await backupSummary(this.deps, ctx.businessId, ctx.now);
      if (s.last?.status === 'failed') push({ key: 'backup-failed', risk: 'Data', tone: 'red', title: 'The latest backup failed', action: 'Review backups', category: 'backup' });
      else if (s.lastReady && ctx.now.getTime() - (s.lastReady.readyAt ?? s.lastReady.createdAt).getTime() > 36 * 3_600_000) push({ key: 'backup-overdue', risk: 'Data', tone: 'amber', title: 'Automatic backup is on but no backup has finished in the last 36 hours', action: 'Review backups', category: 'backup' });
    }

    const q = await this.queueSnapshot().catch(() => null);
    if (q && q.configured && !q.reachable) push({ key: 'queue-down', risk: 'Operational', tone: 'red', title: 'The background job queue is not reachable, so scheduled jobs are not running', action: 'Open system health', category: 'health' });
    const failedJobs = q ? q.queues.reduce((n, x) => n + x.failed, 0) : 0;
    if (failedJobs > 0) push({ key: 'jobs', risk: 'Operational', tone: 'amber', title: `${failedJobs} background job${failedJobs === 1 ? '' : 's'} failed`, action: 'Open system health', category: 'health' });

    this.healthCache = { at: Date.now(), businessId: ctx.businessId, items };
    return items;
  }

  async health(ctx: HubCtx) {
    const items = await this.healthItems(ctx);
    const q = await this.queueSnapshot().catch(() => null);
    return {
      status: items.length ? 'Needs attention' : 'Healthy',
      tone: items.length ? ('amber' as const) : ('green' as const),
      items,
      rows: [
        ...items.slice(0, 6).map((i) => ({ label: i.risk, value: i.title })),
        { label: 'Background jobs', value: q && q.configured ? (q.reachable ? `${q.queues.reduce((n, x) => n + x.failed, 0)} failed` : 'Queue not reachable') : 'Queue not configured' },
      ],
    };
  }

  // ------------------------------------------------------------------ home

  async home(ctx: HubCtx) {
    const items = await this.healthItems(ctx);
    const inCats = (...cats: string[]) => items.filter((i) => cats.includes(i.category));
    const card = (label: string, icon: string, category: string, cats: string[], okStatus: string, okMeta: string) => {
      const found = inCats(...cats);
      return { label, icon, category, status: found.length ? 'Needs attention' : okStatus, meta: found.length ? (found.length === 1 ? found[0].title : `${found.length} items`) : okMeta, tone: (found.length ? (found.some((f) => f.tone === 'red') ? 'red' : 'amber') : 'green') as HubTone };
    };
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const [counts, wf] = await Promise.all([
      Promise.all([this.prisma.customer.count({ where: { businessId: ctx.businessId } }), this.prisma.order.count({ where: { businessId: ctx.businessId } }), this.prisma.product.count({ where: { businessId: ctx.businessId } })]),
      this.prisma.workflow.count({ where: { businessId: ctx.businessId, active: true } }),
    ]);

    const recent = await this.prisma.auditLog.findMany({ where: { businessId: ctx.businessId, entity: { in: ['setting', 'role_capability_override'] } }, orderBy: { createdAt: 'desc' }, take: 5 });
    const names = await this.names(recent.map((e) => e.actorUserId));
    const recentChanges = recent.map((e) => ({
      change: e.entity === 'role_capability_override' ? `Permissions ${e.action.endsWith('reset') ? 'reset' : 'changed'} for ${((e.after ?? {}) as { role?: string }).role ?? 'a role'}` : describeAudit(e.action, e.entity, e.after),
      meta: `${relativeTime(e.createdAt, ctx.now)} · ${e.actorUserId ? (names.get(e.actorUserId) ?? 'Unknown user') : 'System'}`,
      category: e.entity === 'role_capability_override' ? 'team' : (e.entityId?.split('.')[0] ?? 'general'),
    }));

    const pins = await this.prisma.settingPin.findMany({ where: { businessId: ctx.businessId, userId: ctx.userId, OR: [{ pinned: true }, { opens: { gte: 2 } }] }, orderBy: [{ pinned: 'desc' }, { opens: 'desc' }], take: 6 });
    const pinned: { label: string; meta: string; icon: string; pin: 'Pinned' | 'Frequent'; category: string; rowKey: string }[] = [];
    for (const p of pins) {
      const cat = this.registry().find((c) => c.key === p.category);
      if (!cat) continue;
      let label: string | null = null;
      for (const g of cat.groups) {
        const r = (await this.rowsOf(g, ctx)).find((x) => x.key === p.rowKey);
        if (r) label = r.label;
      }
      if (!label) continue;
      pinned.push({ label, meta: `${cat.label}${p.pinned ? '' : ` · opened ${p.opens} times`}`, icon: cat.icon, pin: p.pinned ? 'Pinned' : 'Frequent', category: p.category, rowKey: p.rowKey });
    }

    return {
      health: [
        card('Configuration', 'activity', 'team', ['team', 'business', 'billing'], 'Healthy', 'No missing configuration'),
        card('Security', 'shield', 'security', ['security'], 'Healthy', 'Two-factor and lockout in order'),
        card('Integrations', 'plug-zap', 'integrations', ['integrations', 'inbox'], 'Healthy', 'No connection needs attention'),
        card('Automations', 'workflow', 'automations', ['automations'], 'Healthy', `${wf} workflow${wf === 1 ? '' : 's'} on`),
        card('AI governance', 'sparkles', 'ai', ['ai'], 'Healthy', 'AI is limited to reading and drafting'),
        card('System', 'activity', 'health', ['health'], 'Healthy', 'No failed background jobs'),
        await this.backupCard(ctx, inCats('backup')),
        { label: 'Data', icon: 'database', category: 'data', status: 'Measured', meta: `${counts[0].toLocaleString('en-US')} customers · ${counts[1].toLocaleString('en-US')} orders · ${counts[2].toLocaleString('en-US')} products`, tone: 'blue' as HubTone },
        { label: 'Notifications', icon: 'bell', category: 'notifications', status: 'Configured', meta: `Nightly close at ${b.nightlyCloseTime}`, tone: 'green' as HubTone },
      ],
      quickActions: [
        { label: 'Review permissions', icon: 'shield-check', category: 'team' },
        { label: 'Security check', icon: 'shield', category: 'security' },
        { label: 'Connect integration', icon: 'plug-zap', category: 'integrations' },
        { label: 'Configure notifications', icon: 'bell', category: 'notifications' },
        { label: 'AI governance', icon: 'sparkles', category: 'ai' },
        { label: 'Export data', icon: 'file-down', category: 'importexport' },
        { label: 'View audit', icon: 'history', category: 'audit' },
        { label: 'System health', icon: 'activity', category: 'health' },
      ],
      recentChanges,
      pinned,
    };
  }

  // ------------------------------------------------------------------ ask

  async ask(ctx: HubCtx, key: string) {
    const overrides = await this.prisma.roleCapabilityOverride.findMany({ where: { businessId: ctx.businessId } });
    const caps = (role: Role) => new Set<string>(((overrides.find((o) => o.role === role)?.capabilities as unknown as string[]) ?? SYSTEM_ROLE_CAPABILITIES[role]) as string[]);
    const manager = caps(Role.manager);
    const staff = caps(Role.staff);
    const customs = await this.prisma.customRole.findMany({ where: { businessId: ctx.businessId } });
    const members = await this.prisma.businessUser.findMany({ where: { businessId: ctx.businessId, active: true }, select: { role: true, customRoleId: true } });

    if (key === 'profit') {
      const withProfit = (cap: string) => customs.filter((c) => (c.capabilities as unknown as string[]).includes(cap));
      const cRoles = withProfit(CAPABILITIES.PROFIT_VIEW);
      const holders = members.filter((m) => (m.customRoleId ? cRoles.some((r) => r.id === m.customRoleId) : m.role === Role.owner || (m.role === Role.manager && manager.has(CAPABILITIES.PROFIT_VIEW)) || (m.role === Role.staff && staff.has(CAPABILITIES.PROFIT_VIEW)))).length;
      return {
        title: 'Who can see profit?',
        answer: `${holders} of ${members.length} active team members can see profit, margin and the profit-bearing reports. Owner always can. Manager ${manager.has(CAPABILITIES.PROFIT_VIEW) ? 'can' : 'cannot'}, Staff ${staff.has(CAPABILITIES.PROFIT_VIEW) ? 'can' : 'cannot'}${cRoles.length ? `, and ${cRoles.length} custom role${cRoles.length === 1 ? '' : 's'} can (${cRoles.map((c) => c.name).join(', ')})` : ''}.`,
        rows: [
          { label: 'Owner', value: 'Yes · always', tone: 'pos' as const },
          { label: 'Manager', value: manager.has(CAPABILITIES.PROFIT_VIEW) ? 'Yes' : 'No' },
          { label: 'Staff', value: staff.has(CAPABILITIES.PROFIT_VIEW) ? 'Yes · review this' : 'No', tone: staff.has(CAPABILITIES.PROFIT_VIEW) ? ('neg' as const) : undefined },
          ...customs.map((c) => ({ label: `Custom · ${c.name}`, value: (c.capabilities as unknown as string[]).includes(CAPABILITIES.PROFIT_VIEW) ? 'Yes' : 'No' })),
          { label: 'People who can', value: `${holders} of ${members.length}` },
        ],
        bullets: ['Profit access exposes cost prices, margins and the tax and P&L reports to everyone in that role', 'The answer is computed from the current role permissions, including any custom roles', 'Noxtill does not change any permission on its own', 'A change takes effect on the person’s next request'],
        note: 'Permissions are enforced server-side, so removing this genuinely blocks the data rather than hiding it.',
        action: { label: 'Open permissions', href: '/settings/team' },
      };
    }
    if (key === 'risky') {
      const rows: { label: string; value: string; tone?: 'neg' | 'pos' }[] = [];
      for (const c of SENSITIVE_CAPS) {
        const who = whoHolds(manager, staff, c.key);
        if (who === 'owner_manager_staff' || who === 'owner_staff') rows.push({ label: `${c.label}`, value: 'Held by Staff · high risk', tone: 'neg' });
        else if (who === 'owner_manager' && [CAPABILITIES.EXPORTS_GENERATE, CAPABILITIES.CREDIT_WRITE_OFF, CAPABILITIES.ROLES_MANAGE, CAPABILITIES.BILLING_MANAGE, CAPABILITIES.GDPR_MANAGE, CAPABILITIES.STAFF_MANAGE, CAPABILITIES.PAYROLL_EXPORT].includes(c.key as never)) rows.push({ label: c.label, value: 'Held by Manager · normally owner only', tone: 'neg' });
      }
      const users = await this.prisma.businessUser.findMany({ where: { businessId: ctx.businessId, active: true, role: { in: [Role.owner, Role.manager] } }, include: { user: { select: { twoFactorEnabled: true } } } });
      const no2fa = users.filter((u) => !u.user.twoFactorEnabled).length;
      if (no2fa) rows.push({ label: 'Owner or manager without two-factor', value: `${no2fa} account${no2fa === 1 ? '' : 's'}`, tone: 'neg' });
      if (rows.length === 0) rows.push({ label: 'Permission review', value: 'Nothing risky found', tone: 'pos' });
      return {
        title: 'Which permissions are risky?',
        answer: rows[0].tone === 'pos' ? 'Nothing stands out: Staff holds no sensitive permission and no Manager holds an owner-only one.' : `${rows.length} item${rows.length === 1 ? '' : 's'} stand out, ranked by what they expose.`,
        rows,
        bullets: ['Checks whether Staff holds any sensitive permission and whether Manager holds owner-only ones', 'Checks owner and manager accounts for two-factor authentication', 'Nothing is changed automatically', 'These are observations, not accusations — your team may have good reasons'],
        note: 'This comes from your actual role permissions and team, not from a general rule.',
        action: { label: 'Open permissions', href: '/settings/team' },
      };
    }
    if (key === 'channels') {
      const [ints, socials] = await Promise.all([this.prisma.integration.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } } }), this.prisma.socialAccount.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } } })]);
      const rows = [
        ...ints.map((i) => ({ label: i.provider.replace(/_/g, ' '), value: i.status === 'connected' ? `Connected${i.lastSyncAt ? ` · synced ${relativeTime(i.lastSyncAt, ctx.now)}` : ''}` : 'Needs attention', tone: i.status === 'connected' ? undefined : ('neg' as const) })),
        ...socials.map((s) => ({ label: s.platform, value: s.status === 'connected' ? 'Connected' : 'Needs attention', tone: s.status === 'connected' ? undefined : ('neg' as const) })),
      ];
      return {
        title: 'What channels are connected?',
        answer: rows.length ? `${rows.filter((r) => !r.tone).length} connected and ${rows.filter((r) => r.tone).length} needing attention.` : 'No integration or social channel is connected.',
        rows: rows.length ? rows : [{ label: 'Connected services', value: 'None' }],
        bullets: ['Lists integrations and social channels with a recorded connection', 'A channel needing attention cannot sync until it is reconnected', 'Customer messages (WhatsApp, SMS, email) use platform-level providers, not a per-business connection', 'Nothing is shown as connected unless it genuinely is'],
        note: 'States come from the connection records, not a live check of the provider.',
        action: { label: 'Open integrations', href: '/integrations' },
      };
    }
    if (key === 'recent') {
      const recent = await this.prisma.auditLog.findMany({ where: { businessId: ctx.businessId, entity: { in: ['setting', 'role_capability_override'] } }, orderBy: { createdAt: 'desc' }, take: 8 });
      const names = await this.names(recent.map((e) => e.actorUserId));
      return {
        title: 'What changed recently?',
        answer: recent.length ? `${recent.length} recent configuration change${recent.length === 1 ? '' : 's'} are recorded.` : 'No configuration change has been recorded yet.',
        rows: recent.length ? recent.map((e) => ({ label: describeAudit(e.action, e.entity, e.after), value: `${relativeTime(e.createdAt, ctx.now)} · ${e.actorUserId ? (names.get(e.actorUserId) ?? 'Unknown') : 'System'}` })) : [{ label: 'Recent changes', value: 'None' }],
        bullets: ['Read directly from the append-only audit log', 'Only changes made from Settings and role permission edits are included', 'Each entry keeps the value before and after'],
        note: 'Settings changed by other screens before this version are not in the log.',
        action: { label: 'Open audit log', href: '/settings/audit' },
      };
    }
    throw new NotFoundException('Unknown question.');
  }

  private async backupCard(ctx: HubCtx, problems: HealthItem[]) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const base = { label: 'Backup', icon: 'hard-drive-download', category: 'backup' };
    if (problems.length > 0) return { ...base, status: 'Needs attention', meta: problems[0].title, tone: (problems.some((p) => p.tone === 'red') ? 'red' : 'amber') as HubTone };
    if (!resolvePolicies(b).bool('backup.enabled')) return { ...base, status: 'Not enabled', meta: 'Automatic backup is off', tone: 'neutral' as HubTone };
    const s = await backupSummary(this.deps, ctx.businessId, ctx.now);
    return { ...base, status: 'Healthy', meta: s.lastReady ? `Last backup ${relativeTime(s.lastReady.readyAt ?? s.lastReady.createdAt, ctx.now)}` : 'First backup pending', tone: 'green' as HubTone };
  }

  /** A person's own interface preferences, with defaults filled in. */
  async preferences(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { uiPreferences: true } });
    return resolveUiPrefs(u.uiPreferences);
  }

  /** A support file with system facts only: never customer names or contact details, payment data, or message content. */
  async diagnostics(ctx: HubCtx) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const started = Date.now();
    let dbStatus = 'responding';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'not responding';
    }
    const dbMs = Date.now() - started;
    const [q, integrations, issues, counts, aiCalls] = await Promise.all([
      this.queueSnapshot().catch(() => null),
      this.prisma.integration.findMany({ where: { businessId: ctx.businessId }, select: { provider: true, status: true, lastSyncAt: true } }),
      this.healthItems(ctx),
      Promise.all([
        this.prisma.customer.count({ where: { businessId: ctx.businessId } }),
        this.prisma.order.count({ where: { businessId: ctx.businessId } }),
        this.prisma.product.count({ where: { businessId: ctx.businessId } }),
        this.prisma.appointment.count({ where: { businessId: ctx.businessId } }),
      ]),
      this.prisma.aiCallLog.count({ where: { businessId: ctx.businessId, createdAt: { gte: new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1)) } } }),
    ]);
    const bundle: Record<string, unknown> = {
      generatedAt: ctx.now.toISOString(),
      business: { id: b.id, name: b.name, planId: b.planId, timezone: b.timezone, currency: b.currency, createdAt: b.createdAt.toISOString() },
      runtime: { node: process.version, environment: process.env.NODE_ENV ?? 'unknown', platform: process.platform },
      database: { status: dbStatus, roundTripMs: dbMs },
      storage: { type: this.deps.s3.storageMode() },
      queues: q ? { configured: q.configured, reachable: q.reachable, failedJobs: q.queues.filter((x) => x.failed > 0).map((x) => ({ queue: x.name, failed: x.failed })) } : null,
      integrations: integrations.map((i) => ({ provider: i.provider, status: i.status, lastSyncAt: i.lastSyncAt?.toISOString() ?? null })),
      ai: { providerConfigured: !!process.env.ANTHROPIC_API_KEY, callsThisMonth: aiCalls },
      recordCounts: { customers: counts[0], orders: counts[1], products: counts[2], bookings: counts[3] },
      openIssues: issues.map((i) => i.title),
    };
    // The list shown to the owner is generated from the same keys, so it can never drift.
    for (const f of DIAGNOSTIC_FIELDS) if (!(f.key in bundle)) throw new Error(`Diagnostic section missing: ${f.key}`);
    return bundle;
  }
}
