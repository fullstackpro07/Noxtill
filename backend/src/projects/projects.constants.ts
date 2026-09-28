export const PROJECTS_QUEUE = 'projects';

export const PROJECT_ERRORS = {
  NOT_FOUND: 'PROJECT_NOT_FOUND',
  OTHER_BRANCH: 'PROJECT_OTHER_BRANCH',
  FORBIDDEN: 'PROJECT_FORBIDDEN',
  INVALID: 'PROJECT_INVALID',
  NAME_REQUIRED: 'PROJECT_NAME_REQUIRED',
  DATES_INVALID: 'PROJECT_DATES_INVALID',
  NOT_READY: 'PROJECT_NOT_READY',
  DELETE_BLOCKED: 'PROJECT_DELETE_BLOCKED',
  TASK_NOT_FOUND: 'PROJECT_TASK_NOT_FOUND',
  CHECKLIST_INCOMPLETE: 'PROJECT_TASK_CHECKLIST_INCOMPLETE',
  DEPS_OPEN: 'PROJECT_TASK_DEPENDENCIES_OPEN',
  DEP_CYCLE: 'PROJECT_DEP_CYCLE',
  RESCHEDULE_BREAKS_DEPS: 'PROJECT_RESCHEDULE_BREAKS_DEPS',
  MILESTONE_NOT_FOUND: 'PROJECT_MILESTONE_NOT_FOUND',
  MILESTONE_TASKS_OPEN: 'PROJECT_MILESTONE_TASKS_OPEN',
  MILESTONE_NEEDS_CLIENT: 'PROJECT_MILESTONE_NEEDS_CLIENT',
  FILE_NOT_FOUND: 'PROJECT_FILE_NOT_FOUND',
  TIME_INVALID: 'PROJECT_TIME_INVALID',
  TIME_NOT_FOUND: 'PROJECT_TIME_NOT_FOUND',
  TIME_STATE: 'PROJECT_TIME_STATE',
  TIMER_NONE: 'PROJECT_TIMER_NONE',
  APPROVAL_NOT_FOUND: 'PROJECT_APPROVAL_NOT_FOUND',
  APPROVAL_STATE: 'PROJECT_APPROVAL_STATE',
  APPROVAL_CLIENT_ONLY: 'PROJECT_APPROVAL_CLIENT_ONLY',
  APPROVAL_NOT_APPROVER: 'PROJECT_APPROVAL_NOT_APPROVER',
  COMMENT_REQUIRED: 'PROJECT_COMMENT_REQUIRED',
  PORTAL_DISABLED: 'PROJECT_PORTAL_DISABLED',
  PORTAL_NO_CUSTOMER: 'PROJECT_PORTAL_NO_CUSTOMER',
  PORTAL_INVALID: 'PROJECT_PORTAL_INVALID',
  PORTAL_CODE: 'PROJECT_PORTAL_CODE',
  TEMPLATE_NOT_FOUND: 'PROJECT_TEMPLATE_NOT_FOUND',
  SETTINGS_INVALID: 'PROJECT_SETTINGS_INVALID',
} as const;

export const TASK_STATUSES = [
  'Backlog',
  'To Do',
  'In Progress',
  'In Review',
  'Blocked',
  'Done',
  'Cancelled',
] as const;
export const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low', 'None'] as const;
export const PROJECT_TYPES = [
  'Client',
  'Internal',
  'Service',
  'Retainer',
  'Campaign',
  'Implementation',
  'Development',
  'Operations',
];
export const BILLING_TYPES = [
  'Fixed',
  'Hourly',
  'Retainer',
  'Milestone',
  'Internal / Non-billable',
];
export const APPROVAL_TYPES = [
  'Milestone',
  'Deliverable',
  'Design',
  'Scope Change',
  'Budget Change',
  'Project Completion',
  'Other',
];
export const APPROVAL_OPEN = ['Sent', 'Viewed'];
export const MILESTONE_DONE = ['Completed'];
export const WIP_LIMIT = 5;

/** Status categories a custom status maps onto — the category is what the metrics reason about. */
export type StatusCategory =
  'Not started' | 'In progress' | 'Paused' | 'Done' | 'Closed';
export interface StatusDef {
  name: string;
  cat: StatusCategory;
  c: string;
  locked: boolean;
}
export const DEFAULT_STATUSES: StatusDef[] = [
  { name: 'Draft', cat: 'Not started', c: '#98A2B3', locked: true },
  { name: 'Planned', cat: 'Not started', c: '#2F4FB3', locked: false },
  { name: 'Active', cat: 'In progress', c: '#12A150', locked: true },
  { name: 'On Hold', cat: 'Paused', c: '#667085', locked: false },
  { name: 'At Risk', cat: 'In progress', c: '#F79009', locked: false },
  { name: 'Blocked', cat: 'Paused', c: '#F04438', locked: false },
  { name: 'Completed', cat: 'Done', c: '#0E8442', locked: true },
  { name: 'Cancelled', cat: 'Closed', c: '#98A2B3', locked: true },
  { name: 'Archived', cat: 'Closed', c: '#D0D5DD', locked: true },
];

export const PROJECT_ROLES = [
  'Owner',
  'Admin',
  'Project Manager',
  'Team Lead',
  'Staff',
  'Contractor',
  'Analyst',
  'Client',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PERMISSION_AREAS = [
  'View all projects',
  'Create projects',
  'Edit projects',
  'Archive projects',
  'View financials',
  'Manage budgets',
  'Create tasks',
  'Assign tasks',
  'Edit others’ tasks',
  'Approve time',
  'Manage files',
  'View private files',
  'Request approvals',
  'Manage client portal',
  'View reports',
  'Export',
  'Manage settings',
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

/** The only matrix cell that has a meaning for portal clients: seeing invoices in the portal. */
export const CLIENT_APPLICABLE_AREAS: PermissionArea[] = ['View financials'];

export type PermissionMatrix = Record<string, Record<string, boolean>>;

/** Same defaults as the design: the first N areas for the managerial roles, fixed sets for the rest. */
export function defaultPermissionMatrix(): PermissionMatrix {
  const firstN: Record<string, number> = {
    Owner: 17,
    Admin: 17,
    'Project Manager': 15,
    'Team Lead': 11,
    Client: 0,
  };
  const fixed: Record<string, string[]> = {
    Staff: ['Create tasks', 'Assign tasks', 'Manage files', 'View reports'],
    Contractor: ['Create tasks', 'Manage files'],
    Analyst: ['View all projects', 'View reports', 'Export'],
  };
  const m: PermissionMatrix = {};
  PERMISSION_AREAS.forEach((a, i) => {
    m[a] = {};
    PROJECT_ROLES.forEach((r) => {
      m[a][r] = fixed[r] ? fixed[r].includes(a) : i < (firstN[r] ?? 0);
    });
  });
  return m;
}

export const NOTIFY_KEYS = [
  'Task assigned',
  'Mentioned',
  'Comment reply',
  'Task overdue',
  'Milestone due',
  'Approval requested',
  'Client comment added',
  'File uploaded',
  'Project status changed',
  'Deadline changed',
] as const;
export type NotifyKey = (typeof NOTIFY_KEYS)[number];
export const DEFAULT_NOTIFY: Record<NotifyKey, boolean> = {
  'Task assigned': true,
  Mentioned: true,
  'Comment reply': true,
  'Task overdue': true,
  'Milestone due': true,
  'Approval requested': true,
  'Client comment added': true,
  'File uploaded': false,
  'Project status changed': false,
  'Deadline changed': true,
};

export interface CustomFieldDef {
  name: string;
  type: string;
  applies: 'Project' | 'Task';
  client: 'Internal only' | 'Client visible';
}

export interface ProjectConfig {
  defMgr: string | null;
  defStatus: string;
  defPri: string;
  defDays: string;
  defTz: string;
  defVis: string;
  defView: string;
  prefix: string;
  nextNo: number;
  tprefix: string;
  year: boolean;
  branchCode: boolean;
  archiveDays: string;
  noHardDelete: boolean;
  portalOn: boolean;
  portalMfa: boolean;
  inviteExp: string;
  statuses: StatusDef[];
  fields: CustomFieldDef[];
  perms: PermissionMatrix;
}

export function defaultConfig(): ProjectConfig {
  return {
    defMgr: null,
    defStatus: 'Planned',
    defPri: 'Medium',
    defDays: 'Mon–Fri',
    defTz: 'UTC',
    defVis: 'Team',
    defView: 'Overview',
    prefix: 'PRJ',
    nextNo: 1,
    tprefix: 'TSK',
    year: true,
    branchCode: false,
    archiveDays: '90 days',
    noHardDelete: true,
    portalOn: true,
    portalMfa: true,
    inviteExp: '14 days',
    statuses: DEFAULT_STATUSES,
    fields: [],
    perms: defaultPermissionMatrix(),
  };
}

export const ARCHIVE_DAYS: Record<string, number | null> = {
  Never: null,
  '30 days': 30,
  '90 days': 90,
  '1 year': 365,
};
export const INVITE_DAYS: Record<string, number> = {
  '7 days': 7,
  '14 days': 14,
  '30 days': 30,
};

/** Automation hooks a project/template can reference. The Automations engine has no project
 * triggers today (`WorkflowTriggerKey` has none), so these are stored as references only. */
export const PROJECT_AUTOMATION_HOOKS: Array<[string, string]> = [
  ['project.created', 'Notify team when a project is created'],
  ['project.deadline_approaching', 'Remind manager before the deadline'],
  ['task.overdue', 'Daily overdue digest'],
  ['milestone.completed', 'Client update draft on milestone completion'],
  ['project.completed', 'Request a review when a project completes'],
];

export const FILE_MAX_BYTES = 25 * 1024 * 1024;
export const FILE_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
];

export const PORTAL_SESSION_HOURS = 12;
export const PORTAL_CODE_MINUTES = 10;
