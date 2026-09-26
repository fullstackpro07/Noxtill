import { HttpStatus } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { CAPABILITIES, SYSTEM_ROLE_CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural, relativeTime } from '../hub.core';
import { HubDeps } from './hub.deps';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

export function describeAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /okhttp|Dart|axios|node/i.test(ua) ? 'App / API client' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export interface SensitiveCap {
  key: string;
  label: string;
  description: string;
  impact: string;
}

/** The capabilities that expose money, personal data or configuration — listed separately so who holds them is always visible. */
export const SENSITIVE_CAPS: SensitiveCap[] = [
  { key: CAPABILITIES.PROFIT_VIEW, label: 'Profit and analytics', description: 'Revenue, cost, margin and profit figures, and the tax and P&L reports.', impact: 'Granting this exposes cost prices and margins. Once a role can see profit, every member of that role can.' },
  { key: CAPABILITIES.EXPENSES_MANAGE, label: 'Expenses', description: 'Recording and editing business expenses.', impact: 'Expense records feed profit figures, so this affects reported profit.' },
  { key: CAPABILITIES.EXPORTS_GENERATE, label: 'Data export', description: 'Downloading business data out of Noxtill.', impact: 'Export permission lets a role take financial and customer data outside Noxtill. Every data export is logged with who ran it.' },
  { key: CAPABILITIES.CREDIT_WRITE_OFF, label: 'Credit write-offs', description: 'Removing a balance you no longer expect to collect.', impact: 'A write-off changes recorded revenue. It always requires the typed confirmation phrase.' },
  { key: CAPABILITIES.CREDIT_RECOVERY_REPORT_VIEW, label: 'Credit recovery report', description: 'Outstanding balances and collections by customer.', impact: 'Exposes what each customer owes.' },
  { key: CAPABILITIES.PAYROLL_EXPORT, label: 'Payroll export', description: 'Exporting staff pay and commission.', impact: 'Exposes what each team member earns.' },
  { key: CAPABILITIES.STAFF_MANAGE, label: 'Team management', description: 'Adding, changing and deactivating team members.', impact: 'This lets a role add people and change who holds which role.' },
  { key: CAPABILITIES.ROLES_MANAGE, label: 'Roles and permissions', description: 'Changing what each role can do.', impact: 'A role that can change permissions can grant itself anything.' },
  { key: CAPABILITIES.BILLING_MANAGE, label: 'Billing', description: 'Plan, subscription and add-ons.', impact: 'Changes what the business pays Noxtill.' },
  { key: CAPABILITIES.GDPR_MANAGE, label: 'Privacy requests', description: 'Customer data export and erasure requests.', impact: 'Can lead to permanent erasure of customer data.' },
  { key: CAPABILITIES.CUSTOMERS_ERASE, label: 'Customer erasure', description: 'Permanently erasing a customer.', impact: 'Erasure is irreversible and breaks links on historical records.' },
  { key: CAPABILITIES.AI_SETTINGS_MANAGE, label: 'AI settings', description: 'AI spend cap, rate limit and feature switches.', impact: 'Controls what AI features can run and how much they may cost.' },
  { key: CAPABILITIES.INTEGRATIONS_MANAGE, label: 'Integrations and API keys', description: 'Connecting services and creating API keys.', impact: 'An API key acts with staff-level access plus the capabilities granted to it.' },
];

const WHO = [
  { value: 'owner', label: 'Owner only' },
  { value: 'owner_manager', label: 'Owner · Manager' },
  { value: 'owner_manager_staff', label: 'Owner · Manager · Staff' },
];

async function effectiveRoleCaps(d: HubDeps, businessId: string) {
  const overrides = await d.prisma.roleCapabilityOverride.findMany({ where: { businessId } });
  const pick = (role: Role): Set<string> => {
    const o = overrides.find((x) => x.role === role);
    return new Set((o ? (o.capabilities as unknown as string[]) : SYSTEM_ROLE_CAPABILITIES[role]) as string[]);
  };
  return { manager: pick(Role.manager), staff: pick(Role.staff), overridden: overrides.length > 0 };
}

export function whoHolds(manager: Set<string>, staff: Set<string>, cap: string): string {
  const m = manager.has(cap);
  const s = staff.has(cap);
  return m && s ? 'owner_manager_staff' : m ? 'owner_manager' : s ? 'owner_staff' : 'owner';
}

export function whoLabel(who: string): string {
  return who === 'owner_staff' ? 'Owner · Staff' : (WHO.find((w) => w.value === who)?.label ?? who);
}

export function capabilityRow(d: HubDeps, c: SensitiveCap): RowDef {
  return row({
    key: `cap:${c.key}`,
    label: c.label,
    description: c.description,
    risk: 'High',
    impact: c.impact,
    requires: CAPABILITIES.ROLES_MANAGE,
    link: { label: 'Open roles', href: '/staff/roles' },
    state: async (ctx) => {
      const { manager, staff } = await effectiveRoleCaps(d, ctx.businessId);
      const who = whoHolds(manager, staff, c.key);
      const customs = await d.prisma.customRole.findMany({ where: { businessId: ctx.businessId } });
      const withCustom = customs.filter((r) => (r.capabilities as unknown as string[]).includes(c.key)).length;
      const value = `${whoLabel(who)}${withCustom ? ` · +${plural(withCustom, 'custom role')}` : ''}`;
      return { value, tone: who === 'owner' ? 'green' : who === 'owner_manager' ? 'amber' : 'red', control: { type: 'select', current: who === 'owner_staff' ? 'owner_manager_staff' : who, options: WHO } };
    },
    write: async (ctx, v: HubValue) => {
      const who = String(v);
      if (!WHO.some((w) => w.value === who)) throw bad('Choose who should hold this permission.');
      const { manager, staff } = await effectiveRoleCaps(d, ctx.businessId);
      const nextManager = new Set(manager);
      const nextStaff = new Set(staff);
      if (who === 'owner') {
        nextManager.delete(c.key);
        nextStaff.delete(c.key);
      } else if (who === 'owner_manager') {
        nextManager.add(c.key);
        nextStaff.delete(c.key);
      } else {
        nextManager.add(c.key);
        nextStaff.add(c.key);
      }
      if (nextManager.size !== manager.size || [...nextManager].some((k) => !manager.has(k))) await d.roles.update(ctx.businessId, Role.manager, [...nextManager]);
      if (nextStaff.size !== staff.size || [...nextStaff].some((k) => !staff.has(k))) await d.roles.update(ctx.businessId, Role.staff, [...nextStaff]);
    },
  });
}

export function accessCategories(d: HubDeps): CategoryDef[] {
  const authEnv = (name: string, fallback: string) => process.env[name] ?? fallback;

  return [
    {
      key: 'sessions',
      label: 'Sessions & Devices',
      title: 'Sessions & Devices',
      icon: 'monitor-smartphone',
      group: 'Access',
      description: 'Where you are signed in, with what Noxtill actually knows about each device.',
      affects: ['Your account', 'Security'],
      affectsNote: 'Signing out a session ends it for refreshing immediately and cannot be undone from here.',
      help: [
        'Only what the sign-in provided is shown — Noxtill does not guess a location from an address.',
        'An access token already issued can keep working until it expires (a few minutes) even after sign-out.',
        'You can only see and end your own sessions.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Your active sessions',
          hint: 'What Noxtill actually knows',
          footer: 'Location is not recorded. The address is the one the sign-in request came from.',
          dynamicRows: async (ctx) => {
            const sessions = await d.prisma.session.findMany({ where: { userId: ctx.userId, revokedAt: null }, orderBy: { lastUsedAt: 'desc' }, take: 25 });
            const rows: RowDef[] = sessions.map((s) => {
              const current = s.id === ctx.sessionId;
              return row({
                key: `session:${s.id}`,
                label: describeAgent(s.userAgent),
                description: `${current ? 'Current session. ' : ''}${s.ipAddress ? `Address ${s.ipAddress}. ` : 'Address not recorded. '}Last active ${relativeTime(s.lastUsedAt, ctx.now)}. Signed in ${relativeTime(s.createdAt, ctx.now)}.`,
                scope: 'User',
                risk: current ? 'Low' : 'Medium',
                state: () => ({
                  value: current ? 'This device' : 'Sign out',
                  tone: current ? 'green' : 'neutral',
                  control: current ? null : { type: 'action', label: 'Sign out', actionKey: `session:${s.id}`, confirm: 'This ends that session so it can no longer refresh. It cannot be undone from here.' },
                }),
              });
            });
            if (sessions.filter((s) => s.id !== ctx.sessionId).length > 0) {
              rows.push(
                row({
                  key: 'sessions-revoke-others',
                  label: 'Sign out all other sessions',
                  description: 'Ends every session of yours except this one.',
                  scope: 'User',
                  risk: 'High',
                  impact: 'Every other device you are signed in on will need to sign in again. This cannot be undone from here.',
                  state: () => ({ value: `${sessions.length - 1} session${sessions.length - 1 === 1 ? '' : 's'}`, tone: 'amber', control: { type: 'action', label: 'Sign out others', actionKey: 'sessions-revoke-others', tone: 'red', confirm: 'All your other sessions will end immediately.' } }),
                }),
              );
            }
            return rows;
          },
        },
        {
          title: 'How sign-in behaves',
          hint: 'Applies to every user',
          rows: [
            row({ key: 'access-token', label: 'Access token lifetime', description: 'How long a sign-in stays valid before it must be refreshed.', risk: 'Medium', state: () => ({ value: authEnv('JWT_ACCESS_TTL', '15m') }) }),
            row({ key: 'refresh-token', label: 'Session length', description: 'How long a session can keep refreshing without signing in again.', risk: 'Medium', state: () => ({ value: authEnv('JWT_REFRESH_TTL', '7d') }) }),
            row({ key: 'idle-timeout', label: 'Inactivity timeout', description: 'Automatic sign-out after a period of inactivity.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
            row({ key: 'new-device-alert', label: 'New device alerts', description: 'Notify on the first sign-in from an unrecognised device.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'team',
      label: 'Team & Permissions',
      title: 'Team & Permissions',
      icon: 'users-round',
      group: 'Access',
      description: 'Who can see and do what, across every module. Enforced server-side — hiding something in the interface is not access control.',
      affects: ['Every module', 'Exports', 'Reports'],
      affectsNote: 'A permission change takes effect on the user’s next request, not only on their next login.',
      help: [
        'Sensitive permissions are listed separately so who holds each one is always visible.',
        'Owner always keeps every permission and cannot be restricted.',
        'A custom role’s permissions replace, rather than add to, the system role’s.',
      ],
      notice: { text: 'Permissions are enforced server-side. A restricted role cannot reach restricted data by any route, whatever the interface shows.', icon: 'shield-check' },
      actions: [
        { label: 'Manage roles', icon: 'external-link', primary: true, href: '/staff/roles', kind: 'link' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Team',
          hint: 'Enforced server-side',
          rows: [
            row({
              key: 'team-users',
              label: 'People with access',
              description: 'Team members of this business, by role.',
              link: { label: 'Open Staff', href: '/staff' },
              state: async (ctx) => {
                const members = await d.prisma.businessUser.findMany({ where: { businessId: ctx.businessId }, select: { role: true, active: true } });
                const active = members.filter((m) => m.active);
                const count = (r: Role) => active.filter((m) => m.role === r).length;
                return { value: `${active.length} active · ${count(Role.owner)} owner · ${count(Role.manager)} manager · ${count(Role.staff)} staff` };
              },
            }),
          ],
        },
        {
          title: 'Roles',
          hint: 'System and custom',
          dynamicRows: async (ctx) => {
            const { manager, staff, overridden } = await effectiveRoleCaps(d, ctx.businessId);
            const customs = await d.prisma.customRole.findMany({ where: { businessId: ctx.businessId } });
            const members = await d.prisma.businessUser.groupBy({ by: ['customRoleId'], where: { businessId: ctx.businessId, active: true, customRoleId: { not: null } }, _count: { _all: true } });
            const rows: RowDef[] = [
              row({ key: 'role-owner', label: 'Owner', description: 'Full access to everything, including settings, billing and exports. Cannot be restricted.', risk: 'High', state: () => ({ value: `All ${SYSTEM_ROLE_CAPABILITIES[Role.owner].length} permissions`, tone: 'neutral' }) }),
              row({ key: 'role-manager', label: 'Manager', description: 'Operational access. Which permissions it holds can be changed below.', risk: 'Medium', state: () => ({ value: `${manager.size} permissions${overridden ? ' · customised' : ''}` }) }),
              row({ key: 'role-staff', label: 'Staff', description: 'Own records and assigned work only, plus any permission granted below.', risk: 'Medium', state: () => ({ value: `${staff.size} permissions` }) }),
            ];
            for (const r of customs) {
              const n = members.find((m) => m.customRoleId === r.id)?._count._all ?? 0;
              rows.push(row({ key: `role-custom:${r.id}`, label: `Custom role · ${r.name}`, description: 'A custom role. Its permissions replace the system role’s for its members.', risk: 'Medium', link: { label: 'Edit role', href: '/staff/roles' }, state: () => ({ value: `${(r.capabilities as unknown as string[]).length} permissions · ${plural(n, 'member')}` }) }));
            }
            return rows;
          },
        },
        {
          title: 'Sensitive permissions',
          hint: 'Who holds each one',
          badge: async (ctx) => {
            const { staff } = await effectiveRoleCaps(d, ctx.businessId);
            const exposed = SENSITIVE_CAPS.filter((c) => staff.has(c.key)).length;
            return exposed > 0 ? { text: `${exposed} held by Staff`, tone: 'amber' } : null;
          },
          rows: SENSITIVE_CAPS.map((c) => capabilityRow(d, c)),
          footer: 'Changing who holds a permission edits the Manager and Staff roles. Owner always holds every permission.',
        },
        {
          title: 'Access scope',
          hint: 'How far a role reaches',
          rows: [
            row({ key: 'scope-branch', label: 'Business or branch', description: 'Access is granted per business record — the main business or an individual branch.', state: () => ({ value: 'Per business or branch' }) }),
          ],
        },
      ],
    },
    {
      key: 'security',
      label: 'Security',
      title: 'Security',
      icon: 'shield',
      group: 'Access',
      description: 'Account protection and security events. Noxtill reports what it actually observes and makes no claims beyond that.',
      affects: ['All users', 'Sessions', 'Exports', 'Settings'],
      affectsNote: 'Two-factor and lockout rules apply to every sign-in.',
      help: [
        'Only security signals Noxtill genuinely records are shown — there is no invented risk score.',
        'Sensitive setting changes and exports are written to the audit log by design.',
        'Password reset and per-user unlock are not available in this version.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Overview',
          hint: 'Measured now',
          rows: [
            row({
              key: 'two-factor-coverage',
              label: 'Two-factor authentication',
              description: 'Team members with two-factor turned on, out of everyone with access.',
              risk: 'High',
              link: { label: 'Set up two-factor', href: '/settings/tools/security' },
              state: async (ctx) => {
                const members = await d.prisma.businessUser.findMany({ where: { businessId: ctx.businessId, active: true }, include: { user: { select: { twoFactorEnabled: true } } } });
                const on = members.filter((m) => m.user.twoFactorEnabled).length;
                return { value: `${on} of ${members.length} enabled`, tone: on === members.length && members.length > 0 ? 'green' : 'amber' };
              },
            }),
            row({
              key: 'locked-accounts',
              label: 'Locked accounts',
              description: 'Accounts currently locked after too many failed sign-ins.',
              risk: 'Medium',
              state: async (ctx) => {
                const members = await d.prisma.businessUser.findMany({ where: { businessId: ctx.businessId }, include: { user: { select: { lockedUntil: true, failedLoginAttempts: true } } } });
                const locked = members.filter((m) => m.user.lockedUntil && m.user.lockedUntil > ctx.now).length;
                const failing = members.filter((m) => (m.user.failedLoginAttempts ?? 0) > 0).length;
                return { value: locked ? `${locked} locked` : failing ? `None locked · ${failing} with recent failures` : 'None', tone: locked ? 'amber' : 'green' };
              },
            }),
          ],
        },
        {
          title: 'Authentication',
          hint: 'Applies to every user',
          rows: [
            row({ key: 'password-min', label: 'Password rule', description: 'The minimum password length checked at sign-up.', risk: 'High', state: () => ({ value: 'At least 8 characters' }) }),
            row({ key: 'lockout', label: 'Sign-in lockout', description: 'Failed attempts allowed before an account is locked, and for how long.', risk: 'High', state: () => ({ value: `${authEnv('LOGIN_MAX_ATTEMPTS', '5')} attempts · ${authEnv('LOGIN_LOCK_MINUTES', '15')} minutes` }) }),
            row({ key: 'two-factor-mine', label: 'Your two-factor status', description: 'Whether two-factor is on for your own account.', scope: 'User', link: { label: 'Manage two-factor', href: '/settings/tools/security' }, state: async (ctx) => {
              const u = await d.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { twoFactorEnabled: true } });
              return { value: u.twoFactorEnabled ? 'On' : 'Off', tone: u.twoFactorEnabled ? 'green' : 'amber' };
            } }),
          ],
        },
        {
          title: 'Security events',
          hint: 'Recorded in the audit log, last 30 days',
          dynamicRows: async (ctx) => {
            const since = new Date(ctx.now.getTime() - 30 * 86_400_000);
            const count = (where: object) => d.prisma.auditLog.count({ where: { businessId: ctx.businessId, createdAt: { gte: since }, ...where } });
            const [perms, exports, custExport, erase, changes] = await Promise.all([
              count({ action: { startsWith: 'role_capability.' } }),
              count({ action: 'data_export.requested' }),
              count({ action: 'customer.export' }),
              count({ action: 'customer.erase' }),
              count({ entity: 'setting' }),
            ]);
            const mk = (key: string, label: string, description: string, n: number) =>
              row({ key, label, description, risk: 'Medium', state: () => ({ value: `${n} in 30 days`, tone: n > 0 ? 'blue' : 'neutral' }) });
            return [
              mk('ev-permissions', 'Permission changes', 'Changes to what Manager or Staff can do.', perms),
              mk('ev-exports', 'Data exports', 'Full or partial data exports requested.', exports),
              mk('ev-customer-export', 'Customer exports', 'Customer lists exported.', custExport),
              mk('ev-erase', 'Customer erasures', 'Customers permanently erased.', erase),
              mk('ev-settings', 'Settings changes', 'Changes made from this Settings screen.', changes),
            ];
          },
          footer: 'Failed sign-ins and new-device sign-ins are not written as events, so they are not listed.',
        },
      ],
    },
  ];
}
