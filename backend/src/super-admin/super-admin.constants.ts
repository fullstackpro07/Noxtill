/**
 * Super Admin Control Center — internal Noxtill administrator permissions (PRD §6).
 *
 * This is a SEPARATE permission domain from tenant capabilities (`common/capabilities`): an
 * admin permission never grants anything inside a tenant workspace, and a tenant capability never
 * grants anything here. Enforced server-side by `SuperAdminGuard` on every admin route.
 */
export const ADMIN_PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  BUSINESSES_VIEW: 'businesses.view',
  BUSINESSES_EDIT: 'businesses.edit',
  BUSINESSES_SUSPEND: 'businesses.suspend',
  BUSINESSES_NOTES: 'businesses.notes',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  SESSIONS_MANAGE: 'sessions.manage',
  PLANS_VIEW: 'plans.view',
  PLANS_MANAGE: 'plans.manage',
  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',
  LIMITS_VIEW: 'limits.view',
  LIMITS_MANAGE: 'limits.manage',
  MODULES_VIEW: 'modules.view',
  MODULES_MANAGE: 'modules.manage',
  ACTIVITY_VIEW: 'activity.view',
  ACTIVITY_EXPORT: 'activity.export',
  SECURITY_VIEW: 'security.view',
  AI_VIEW: 'ai.view',
  AI_MANAGE: 'ai.manage',
  COMMUNICATIONS_VIEW: 'communications.view',
  INTEGRATIONS_VIEW: 'integrations.view',
  AUDIT_VIEW: 'audit.view',
  ADMINS_MANAGE: 'admins.manage',
} as const;

export type AdminPermission =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] =
  Object.values(ADMIN_PERMISSIONS);

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  'dashboard.view': 'View the platform dashboard',
  'businesses.view': 'View businesses',
  'businesses.edit': 'Edit business details',
  'businesses.suspend': 'Suspend, reactivate or archive businesses',
  'businesses.notes': 'Write internal notes',
  'users.view': 'View users',
  'users.manage': 'Suspend users, change roles, send password resets',
  'sessions.manage': 'Revoke user sessions',
  'plans.view': 'View plans',
  'plans.manage': 'Create and edit plans',
  'subscriptions.view': 'View subscriptions',
  'subscriptions.manage': 'Change, extend or cancel subscriptions',
  'limits.view': 'View usage and limits',
  'limits.manage': 'Override business limits',
  'modules.view': 'View module access',
  'modules.manage': 'Change module access (global and per business)',
  'activity.view': 'View product activity',
  'activity.export': 'Export activity as CSV',
  'security.view': 'View security events and sessions',
  'ai.view': 'View AI credit usage',
  'ai.manage': 'Adjust AI credits',
  'communications.view': 'View WhatsApp, SMS and email usage',
  'integrations.view': 'View connected integrations',
  'audit.view': 'View the admin audit log',
  'admins.manage': 'Manage admin accounts and roles',
};

const VIEW_ALL: AdminPermission[] = ALL_ADMIN_PERMISSIONS.filter((p) =>
  p.endsWith('.view'),
);

export const SUPER_ADMIN_ROLE = 'super_admin';

/** Seeded system roles (PRD §6.1/§6.2). Permissions are editable afterwards, except super_admin. */
export const SYSTEM_ADMIN_ROLES: {
  key: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
}[] = [
  {
    key: SUPER_ADMIN_ROLE,
    name: 'Super Admin',
    description: 'Full platform administration. Always holds every permission.',
    permissions: ALL_ADMIN_PERMISSIONS,
  },
  {
    key: 'platform_admin',
    name: 'Platform Admin',
    description:
      'Platform and tenant management, without admin-account control.',
    permissions: ALL_ADMIN_PERMISSIONS.filter((p) => p !== 'admins.manage'),
  },
  {
    key: 'billing_admin',
    name: 'Billing Admin',
    description: 'Plans, subscriptions and AI credits.',
    permissions: [
      'dashboard.view',
      'businesses.view',
      'plans.view',
      'plans.manage',
      'subscriptions.view',
      'subscriptions.manage',
      'limits.view',
      'ai.view',
      'ai.manage',
      'communications.view',
    ],
  },
  {
    key: 'support_admin',
    name: 'Support Admin',
    description: 'Customer support and authorized troubleshooting.',
    permissions: [
      'dashboard.view',
      'businesses.view',
      'businesses.notes',
      'users.view',
      'users.manage',
      'sessions.manage',
      'subscriptions.view',
      'limits.view',
      'modules.view',
      'activity.view',
      'integrations.view',
      'ai.view',
      'communications.view',
    ],
  },
  {
    key: 'security_admin',
    name: 'Security Admin',
    description: 'Security monitoring and investigations.',
    permissions: [
      'dashboard.view',
      'businesses.view',
      'users.view',
      'sessions.manage',
      'activity.view',
      'activity.export',
      'security.view',
      'audit.view',
    ],
  },
  {
    key: 'analyst',
    name: 'Analyst',
    description: 'Read-only analytics and reports.',
    permissions: VIEW_ALL.filter((p) => p !== 'audit.view'),
  },
];

export const SUPER_ADMIN_ERROR_CODES = {
  INVALID_CREDENTIALS: 'ADMIN_INVALID_CREDENTIALS',
  LOCKED: 'ADMIN_LOCKED',
  DISABLED: 'ADMIN_DISABLED',
  TOTP_INVALID: 'ADMIN_TOTP_INVALID',
  REAUTH_REQUIRED: 'ADMIN_REAUTH_REQUIRED',
  FORBIDDEN: 'ADMIN_FORBIDDEN',
  SESSION_INVALID: 'ADMIN_SESSION_INVALID',
  NOT_FOUND: 'ADMIN_NOT_FOUND',
  INVALID: 'ADMIN_INVALID_REQUEST',
  CONFLICT: 'ADMIN_CONFLICT',
} as const;

export const ADMIN_ACCESS_TTL = '15m';
/** Absolute admin session lifetime — never extended by activity. */
export const ADMIN_SESSION_MAX_HOURS = 12;
/** An admin session idle longer than this cannot be refreshed. */
export const ADMIN_IDLE_MINUTES = 30;
export const ADMIN_CHALLENGE_TTL = '5m';
export const ADMIN_MAX_LOGIN_ATTEMPTS = 5;
export const ADMIN_LOCK_MINUTES = 30;
export const TOTP_ISSUER = 'Noxtill Admin';
