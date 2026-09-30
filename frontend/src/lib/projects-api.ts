import { apiFetch } from "./api-client";

export type Health = "Healthy" | "Watch" | "At Risk" | "Critical" | "No Data";
export type PermissionArea =
  | "View all projects"
  | "Create projects"
  | "Edit projects"
  | "Archive projects"
  | "View financials"
  | "Manage budgets"
  | "Create tasks"
  | "Assign tasks"
  | "Edit others’ tasks"
  | "Approve time"
  | "Manage files"
  | "View private files"
  | "Request approvals"
  | "Manage client portal"
  | "View reports"
  | "Export"
  | "Manage settings";

export interface StatusDef {
  name: string;
  cat: string;
  c: string;
  locked: boolean;
}
export interface CustomFieldDef {
  name: string;
  type: string;
  applies: "Project" | "Task";
  client: "Internal only" | "Client visible";
}

export interface ProjectRow {
  id: string;
  businessId: string;
  number: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  customerContact: string | null;
  managerId: string | null;
  type: string;
  status: string;
  statusCat: string;
  priority: string;
  visibility: string;
  health: Health;
  healthWhy: string;
  dims: Array<{ dim: string; v: string }>;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  dueLocked: boolean;
  baselineDueDate: string | null;
  taskCount: number;
  openCount: number;
  doneCount: number;
  overdueCount: number;
  blockedCount: number;
  nextMilestone: { id: string; name: string; date: string } | null;
  budget: number | null;
  consumed: number | null;
  billingType: string;
  description: string | null;
  objective: string | null;
  deliverables: string | null;
  exclusions: string | null;
  requireClientApproval: boolean;
  lastActivityAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  favorite: boolean;
  members: Array<{ personId: string; roleLabel: string; allocationPct: number }>;
  customFields: Record<string, unknown>;
  automationRefs: string[];
  templateId: string | null;
}

export interface ChecklistItem {
  t: string;
  done: boolean;
  req: boolean;
}

export interface TaskRow {
  id: string;
  number: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  baselineStart: string | null;
  baselineDue: string | null;
  estimateMins: number;
  loggedMins: number;
  checklist: ChecklistItem[];
  blocked: boolean;
  blockType: string | null;
  blockerNote: string | null;
  clientVisible: boolean;
  customFields: Record<string, unknown>;
  deps: string[];
  subDone: number;
  subTotal: number;
  commentCount: number;
  milestoneIds: string[];
  critical: boolean;
  createdById: string | null;
  completedAt: string | null;
}

export interface MilestoneRow {
  id: string;
  number: string;
  projectId: string;
  name: string;
  ownerId: string | null;
  plannedDate: string;
  actualDate: string | null;
  status: string;
  storedStatus: string;
  pct: number;
  description: string | null;
  approvalMode: string;
  approval: string;
  taskIds: string[];
}

export interface Person {
  id: string;
  name: string;
  systemRole: string;
  projectRole: string;
  hasRate: boolean;
}

export interface Workspace {
  today: string;
  weekStart: string;
  currency: string;
  businessId: string;
  businessName: string;
  me: { userId: string; personId: string | null; name: string; role: string; can: Record<PermissionArea, boolean> };
  config: {
    statuses: StatusDef[];
    fields: CustomFieldDef[];
    defMgr: string | null;
    defStatus: string;
    defPri: string;
    defVis: string;
    defView: string;
    defDays: string;
    portalOn: boolean;
    types: string[];
    billing: string[];
    priorities: string[];
    hooks: Array<{ k: string; wf: string }>;
    wipLimit: number;
  };
  people: Person[];
  customers: Array<{ id: string; name: string; email: string | null }>;
  templates: Array<{ id: string; name: string; category: string }>;
  projects: ProjectRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  workload: Array<{ id: string; name: string; hours: number; capacity: number | null; tasks: number; overdue: number }>;
  capacityKnown: boolean;
  timer: { projectId: string; taskId: string | null; startedAt: string } | null;
}

export interface Kpi {
  label: string;
  value: string;
  cmp: string;
  cmpTone: "good" | "bad" | "warn" | "neutral" | "muted";
  period: string;
  fresh: string;
  go: string;
  f: string;
}
export interface RiskItem {
  sev: "HIGH" | "MED" | "LOW";
  t: string;
  d: string;
  pid: string;
  ev: string;
  conf: string;
  view: string;
}
export interface ActivityItem {
  id: string;
  who: string;
  what: string;
  when: string;
  ev: string;
  projectId: string | null;
  taskId: string | null;
}
export interface Overview {
  today: string;
  generatedAt: string;
  kpis: Kpi[];
  projectCount: number;
  healthSeg: Array<{ label: Health; n: number }>;
  progress: Array<{ id: string; name: string; progress: number; health: Health }>;
  risks: RiskItem[];
  aiInsight: string;
  aiEvidence: string;
  insightSource: "ai" | "rules";
  milestones: Array<{ id: string; name: string; projectName: string; projectHealth: Health; owner: string; date: string; status: string }>;
  workload: Workspace["workload"];
  capacityKnown: boolean;
  activity: ActivityItem[];
}

export interface FileRow {
  id: string;
  projectId: string;
  name: string;
  ext: string;
  folder: string;
  access: "client_shared" | "internal" | "private";
  pinned: boolean;
  linkType: string;
  linkId: string | null;
  by: string;
  size: number;
  mime: string;
  version: number;
  modified: string;
  versions: Array<{ n: number; note: string; by: string; when: string; size: number }>;
}

export interface FeedItem {
  id: string;
  kind: "comment" | "event";
  who: string;
  what: string;
  body: string;
  ev: string;
  when: string;
  projectId: string | null;
  taskId: string | null;
  edited: boolean;
  mentionsMe: boolean;
}

export interface TimeEntry {
  id: string;
  number: string;
  personId: string;
  who: string;
  projectId: string;
  taskId: string | null;
  taskNumber: string | null;
  date: string;
  minutes: number;
  billable: boolean;
  /** Bill rate snapshot. */
  rate: number | null;
  /** Staff wage snapshot. */
  costRate: number | null;
  value: number | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  note: string | null;
  rejectReason: string | null;
  mine: boolean;
  canSubmit: boolean;
  canApprove: boolean;
}
export interface TimeData {
  today: string;
  entries: TimeEntry[];
  kpis: { today: number; teamWeek: number; billable: number; nonBillable: number; pending: number; billableValue: number | null; ratesMissing: number };
  canApprove: boolean;
  canSeeRates: boolean;
}

export interface ApprovalRow {
  id: string;
  number: string;
  projectId: string;
  type: string;
  item: string;
  message: string | null;
  evidence: string;
  evidenceFileId: string | null;
  milestoneId: string | null;
  kind: "client" | "internal";
  approverUserId: string | null;
  from: string;
  requestedAt: string | null;
  dueDate: string | null;
  status: string;
  lastActivityAt: string;
  isMine: boolean;
  audit: Array<{ who: string; what: string; note: string | null; t: string }>;
}

export interface Delivery {
  emailed: boolean;
  reason?: string;
  link?: string;
}

export interface ClientView {
  business: string;
  currency: string;
  project: { id: string; name: string; client: string; progress: number; status: string; dueDate: string | null };
  cards: { progress: number; status: string; nextMilestone: { id: string; name: string; status: string; date: string } | null; waiting: number; sharedFiles: number; target: string | null; outstanding: number | null; invoicesShared: boolean };
  updates: Array<{ t: string; when: string }>;
  tasks: Array<{ id: string; title: string; status: string; due: string | null }>;
  milestones: Array<{ id: string; name: string; status: string; date: string; actual: string | null }>;
  files: Array<{ id: string; name: string; ext: string; version: number; size: number }>;
  approvals: Array<{ id: string; item: string; type: string; status: string; message: string; due: string | null; open: boolean; last: string }>;
  invoices: Array<{ no: string; amount: number; status: string; paid: boolean }> | null;
  fields: Array<{ name: string; value: string }>;
  messages: Array<{ id: string; who: string; body: string; when: string }>;
}
export interface PortalPreview extends ClientView {
  portalOn: boolean;
  requireCode: boolean;
  inviteExp: string;
  emailReady: boolean;
  access: Array<{ id: string; email: string | null; clientName: string; expiresAt: string; active: boolean; revoked: boolean; visits: number; lastVisitAt: string | null }>;
}

export interface ReportData {
  key: string;
  title: string;
  note: string;
  rows: Array<{ label: string; w1: number; c1: string; w2: number; c2: string; hasB: boolean; wb: number; v: string }>;
  legend: Array<{ c: string; t: string }>;
  cols: string[];
  table: string[][];
  src: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  category: string;
  businessType: string;
  status: "Draft" | "Published" | "Archived";
  phases: Array<{ name: string; days: number; tasks: string[] }>;
  milestones: string[];
  roles: string[];
  docs: string | null;
  hooks: string[];
  chain: boolean;
  taskChain: boolean;
  billing: string;
  priority: string;
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
  wipLimit: number;
  statuses: StatusDef[];
  fields: CustomFieldDef[];
  perms: Record<string, Record<string, boolean>>;
}
export interface SettingsData {
  config: ProjectConfig;
  canManage: boolean;
  canManageBudgets: boolean;
  numberPreview: string;
  roles: string[];
  areas: PermissionArea[];
  clientAreas: PermissionArea[];
  fieldTypes: string[];
  people: Array<{ id: string; name: string; systemRole: string; projectRole: string; locked: boolean; costRate: number | null; billRate: number | null }>;
  notify: Record<string, boolean>;
}

export interface Plan {
  phases: Array<{ name: string; days: number; tasks: Array<{ title: string; role: string; est: number }> }>;
  ms: string[];
}

const j = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const scopeQ = (scope?: string) => (scope === "all" ? "?scope=all" : "");

export const fetchWorkspace = (scope?: string) => apiFetch<Workspace>(`/projects/workspace${scopeQ(scope)}`);
export const fetchOverview = (period: string, scope?: string) => apiFetch<Overview>(`/projects/overview?period=${encodeURIComponent(period)}${scope === "all" ? "&scope=all" : ""}`);

export const createProject = (body: Record<string, unknown>) => apiFetch<{ id: string; number: string; status: string }>("/projects", { method: "POST", ...j(body) });
export const updateProject = (id: string, body: Record<string, unknown>) => apiFetch<{ ok: true }>(`/projects/${id}`, { method: "PATCH", ...j(body) });
export const setMembers = (id: string, members: Array<{ personId: string; roleLabel?: string; allocationPct?: number }>) => apiFetch(`/projects/${id}/members`, { method: "PUT", ...j({ members }) });
export const bulkProjects = (ids: string[], action: "status" | "archive", status?: string) => apiFetch<{ updated: number }>("/projects/bulk", { method: "POST", ...j({ ids, action, status }) });
export const toggleFavorite = (id: string) => apiFetch<{ favorite: boolean }>(`/projects/${id}/favorite`, { method: "POST" });
export const projectReadiness = (id: string) => apiFetch<{ ready: boolean; items: string[]; name: string }>(`/projects/${id}/readiness`);
export const completeProject = (id: string) => apiFetch(`/projects/${id}/complete`, { method: "POST" });
export const exportProjects = (ids: string[], scope?: string) => apiFetch<{ filename: string; csv: string; count: number }>(`/projects/export${scopeQ(scope)}`, { method: "POST", ...j({ ids }) });

export const fetchSavedViews = () => apiFetch<Array<{ id: string; name: string; visibility: string; filters: Record<string, string>; mine: boolean }>>("/projects/views");
export const saveView = (name: string, visibility: string, filters: Record<string, string>) => apiFetch<{ id: string }>("/projects/views", { method: "POST", ...j({ name, visibility, filters }) });
export const deleteView = (id: string) => apiFetch(`/projects/views/${id}`, { method: "DELETE" });

export const createTask = (body: Record<string, unknown>) => apiFetch<{ id: string; number: string }>("/projects/tasks", { method: "POST", ...j(body) });
export const updateTask = (id: string, body: Record<string, unknown>) => apiFetch<{ ok: true; warning: string | null }>(`/projects/tasks/${id}`, { method: "PATCH", ...j(body) });
export const setTaskStatus = (id: string, status: string) => apiFetch<{ ok: true; warning: string | null }>(`/projects/tasks/${id}/status`, { method: "POST", ...j({ status }) });
export const addDependency = (id: string, dependsOnId: string) => apiFetch(`/projects/tasks/${id}/dependencies`, { method: "POST", ...j({ dependsOnId }) });
export const removeDependency = (id: string, dep: string) => apiFetch(`/projects/tasks/${id}/dependencies/${dep}`, { method: "DELETE" });
export const fetchTaskComments = (id: string) => apiFetch<Array<{ id: string; who: string; body: string; when: string; edited: boolean }>>(`/projects/tasks/${id}/comments`);
export const addTaskComment = (id: string, body: string) => apiFetch<{ ok: true; notified: number }>(`/projects/tasks/${id}/comments`, { method: "POST", ...j({ body }) });
export const reschedulePreview = (id: string, dueDate: string) => apiFetch<{ taskId: string; number: string; delta: number; dependents: number; milestones: number; items: string[]; onlyAllowed: boolean }>(`/projects/tasks/${id}/reschedule/preview`, { method: "POST", ...j({ dueDate }) });
export const reschedule = (id: string, dueDate: string, withDependents: boolean) => apiFetch<{ moved: number; delta: number }>(`/projects/tasks/${id}/reschedule`, { method: "POST", ...j({ dueDate, withDependents }) });

export const createMilestone = (body: Record<string, unknown>) => apiFetch<{ id: string; number: string }>("/projects/milestones", { method: "POST", ...j(body) });
export const completeMilestone = (id: string) => apiFetch(`/projects/milestones/${id}/complete`, { method: "POST" });
export const readyMilestone = (id: string) => apiFetch<{ ok: true; needsRequest: boolean }>(`/projects/milestones/${id}/ready`, { method: "POST" });
export const exportMilestones = (ids: string[]) => apiFetch<{ filename: string; csv: string; count: number }>("/projects/milestones/export", { method: "POST", ...j({ ids }) });

export const fetchFiles = () => apiFetch<FileRow[]>("/projects/files");
export function uploadProjectFile(file: File, fields: { projectId: string; folder?: string; access?: string; fileId?: string; note?: string; linkType?: string; linkId?: string }) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(fields).forEach(([k, v]) => v && form.append(k, v));
  return apiFetch<{ id: string }>("/projects/files", { method: "POST", body: form });
}
export const restoreFileVersion = (id: string, n: number) => apiFetch(`/projects/files/${id}/restore`, { method: "POST", ...j({ n }) });
export const setFileAccess = (id: string, access: string) => apiFetch(`/projects/files/${id}/access`, { method: "POST", ...j({ access }) });
export const toggleFilePin = (id: string) => apiFetch<{ pinned: boolean }>(`/projects/files/${id}/pin`, { method: "POST" });
export const archiveFile = (id: string) => apiFetch(`/projects/files/${id}/archive`, { method: "POST" });
export const fileDownload = (id: string) => apiFetch<{ url: string; name: string }>(`/projects/files/${id}/download`);

export const fetchFeed = () => apiFetch<{ items: FeedItem[]; people: string[] }>("/projects/activity");
export const postProjectComment = (projectId: string, body: string) => apiFetch<{ ok: true; notified: number }>(`/projects/${projectId}/comments`, { method: "POST", ...j({ body }) });

export const fetchTime = () => apiFetch<TimeData>("/projects/time");
export const addTime = (body: { projectId: string; taskId?: string | null; date: string; hours: number; note?: string; billable?: boolean }) => apiFetch<{ id: string; number: string }>("/projects/time", { method: "POST", ...j(body) });
export const startTimer = (projectId: string, taskId?: string | null) => apiFetch<{ ok: true; previousSaved: { minutes: number } | null }>("/projects/time/timer/start", { method: "POST", ...j({ projectId, taskId: taskId || undefined }) });
export const stopTimer = () => apiFetch<{ minutes: number }>("/projects/time/timer/stop", { method: "POST" });
export const submitTime = (id: string) => apiFetch(`/projects/time/${id}/submit`, { method: "POST" });
export const decideTime = (ids: string[], decision: "approved" | "rejected", reason?: string) => apiFetch<{ updated: number }>("/projects/time/decide", { method: "POST", ...j({ ids, decision, reason }) });

export const fetchApprovals = () => apiFetch<ApprovalRow[]>("/projects/approvals");
export const createApproval = (body: Record<string, unknown>) => apiFetch<{ id: string; number: string; delivery: Delivery | null }>("/projects/approvals", { method: "POST", ...j(body) });
export const decideApproval = (id: string, decision: string, comment?: string) => apiFetch(`/projects/approvals/${id}/decide`, { method: "POST", ...j({ decision, comment }) });
export const remindApproval = (id: string) => apiFetch<{ delivery: Delivery }>(`/projects/approvals/${id}/remind`, { method: "POST" });
export const resubmitApproval = (id: string) => apiFetch<{ delivery: Delivery }>(`/projects/approvals/${id}/resubmit`, { method: "POST" });
export const cancelApproval = (id: string) => apiFetch(`/projects/approvals/${id}/cancel`, { method: "POST" });

export const fetchPortalPreview = (projectId: string) => apiFetch<PortalPreview>(`/projects/portal/${projectId}`);
export const invitePortal = (projectId: string, email?: string) => apiFetch<Delivery>(`/projects/portal/${projectId}/invite`, { method: "POST", ...j({ email: email || undefined }) });
export const revokePortal = (accessId: string) => apiFetch(`/projects/portal/access/${accessId}/revoke`, { method: "POST" });

export const fetchReport = (key: string, scope?: string) => apiFetch<ReportData>(`/projects/reports/${encodeURIComponent(key)}${scopeQ(scope)}`);
export const exportReport = (key: string, scope?: string) => apiFetch<{ filename: string; csv: string }>(`/projects/reports/${encodeURIComponent(key)}/export${scopeQ(scope)}`, { method: "POST" });
export const fetchSavedReports = () => apiFetch<Array<{ id: string; key: string; chartType: string }>>("/projects/reports/saved");
export const saveReport = (key: string, chartType: string) => apiFetch("/projects/reports/saved", { method: "POST", ...j({ key, chartType }) });
export const unsaveReport = (id: string) => apiFetch(`/projects/reports/saved/${id}`, { method: "DELETE" });

export const fetchTemplates = () => apiFetch<TemplateRow[]>("/projects/templates");
export const createTemplate = (body: Record<string, unknown>) => apiFetch<{ id: string; status: string }>("/projects/templates", { method: "POST", ...j(body) });
export const publishTemplate = (id: string) => apiFetch(`/projects/templates/${id}/publish`, { method: "POST" });
export const duplicateTemplate = (id: string) => apiFetch(`/projects/templates/${id}/duplicate`, { method: "POST" });
export const archiveTemplate = (id: string) => apiFetch(`/projects/templates/${id}/archive`, { method: "POST" });

export const fetchSettings = () => apiFetch<SettingsData>("/projects/settings");
export const saveSettings = (config: ProjectConfig) => apiFetch("/projects/settings", { method: "PUT", ...j({ config }) });
export const setProjectRole = (businessUserId: string, role: string) => apiFetch(`/projects/settings/roles/${businessUserId}`, { method: "PUT", ...j({ role }) });
export const saveNotify = (prefs: Record<string, boolean>) => apiFetch("/projects/settings/notify", { method: "PUT", ...j({ prefs }) });

export const aiPlan = (body: { projectId: string; goal: string; due?: string; constraints?: string }) => apiFetch<{ plan: Plan; source: string }>("/projects/ai/plan", { method: "POST", ...j(body) });
export const aiAccept = (body: { projectId: string; plan: Plan; due?: string }) => apiFetch<{ tasks: number; milestones: number }>("/projects/ai/accept", { method: "POST", ...j(body) });
export const aiStatus = (projectId: string, audience: "Internal" | "Client") => apiFetch<{ text: string }>("/projects/ai/status", { method: "POST", ...j({ projectId, audience }) });

export interface ProjectLinks {
  customer: { id: string; name: string } | null;
  since?: string | null;
  quotations: { count: number; latest: { no: number; status: string; total: number | null } | null } | null;
  invoices: { count: number; latestNo: number | null; invoiced: number | null; paid: number | null } | null;
  conversationId: string | null;
  contract: { id: string; name: string } | null;
}
export const fetchProjectLinks = (id: string) => apiFetch<ProjectLinks>(`/projects/${id}/links`);
export const setBillRate = (businessUserId: string, rate: number | null) => apiFetch(`/projects/settings/rates/${businessUserId}`, { method: "PUT", body: JSON.stringify({ rate }) });
export const setFileMeta = (id: string, body: { folder?: string; linkType?: string; linkId?: string | null }) => apiFetch(`/projects/files/${id}/meta`, { method: "POST", body: JSON.stringify(body) });
