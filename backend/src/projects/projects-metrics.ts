/**
 * Pure computations over real project rows — progress, 6-dimension health, budget consumption,
 * milestone derived status, workload and the risk list. No I/O, no invented numbers: every value
 * is a count/sum over the rows passed in, and "No Data" is returned when there is nothing to score.
 */
import { StatusDef, WIP_LIMIT } from './projects.constants';
import { dayDiff } from './projects-context.service';

export type Health = 'Healthy' | 'Watch' | 'At Risk' | 'Critical' | 'No Data';
export type DimHealth = 'Healthy' | 'Watch' | 'Risk' | 'Critical' | 'No Data';

export interface MTask {
  id: string;
  number: string;
  projectId: string;
  title: string;
  assigneeId: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  estimateMins: number;
  loggedMins: number;
  blocked: boolean;
  blockType: string | null;
  deps: string[]; // task ids this task depends on
  parentTaskId: string | null;
}
export interface MMilestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string;
  status: string;
  approvalMode: string;
  taskIds: string[];
}
export interface MProject {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  budget: number | null;
  managerId: string | null;
}
export interface MApproval {
  projectId: string;
  type: string;
  status: string;
  approverKind: string;
  dueDate: string | null;
}

export const isOpenTask = (t: { status: string }) =>
  t.status !== 'Done' && t.status !== 'Cancelled';
export const isBlocked = (t: { status: string; blocked: boolean }) =>
  isOpenTask(t) && (t.blocked || t.status === 'Blocked');
export const isOverdue = (
  t: { status: string; dueDate: string | null },
  today: string,
) => isOpenTask(t) && !!t.dueDate && t.dueDate < today;

export function statusCategory(statuses: StatusDef[], name: string): string {
  return statuses.find((s) => s.name === name)?.cat ?? 'In progress';
}

/** Task-count method: Done ÷ all non-cancelled tasks (subtasks included). */
export function progressOf(tasks: MTask[], projectStatusCat: string): number {
  if (projectStatusCat === 'Done') return 100;
  const counted = tasks.filter((t) => t.status !== 'Cancelled');
  if (!counted.length) return 0;
  return Math.round(
    (counted.filter((t) => t.status === 'Done').length / counted.length) * 100,
  );
}

/** Derived milestone status: stored status, upgraded to Overdue / At Risk from real dates and tasks. */
export function milestoneStatus(
  m: MMilestone,
  tasks: Map<string, MTask>,
  today: string,
): string {
  if (m.status === 'Completed' || m.status === 'Cancelled') return m.status;
  if (m.plannedDate < today) return 'Overdue';
  const linked = m.taskIds
    .map((id) => tasks.get(id))
    .filter(Boolean) as MTask[];
  const soon = dayDiff(m.plannedDate, today) <= 7;
  const late = linked.some(
    (t) => isOpenTask(t) && t.dueDate && t.dueDate > m.plannedDate,
  );
  if (
    linked.some((t) => isBlocked(t)) ||
    late ||
    (soon && linked.some((t) => isOverdue(t, today)))
  )
    return 'At Risk';
  return m.status;
}

export function milestonePct(m: MMilestone, tasks: Map<string, MTask>): number {
  if (m.status === 'Completed') return 100;
  const linked = m.taskIds
    .map((id) => tasks.get(id))
    .filter(Boolean) as MTask[];
  if (!linked.length) return 0;
  return Math.round(
    (linked.filter((t) => t.status === 'Done').length / linked.length) * 100,
  );
}

export interface HealthResult {
  health: Health;
  dims: Array<{ dim: string; v: DimHealth }>;
  why: string;
}

const RANK: Record<DimHealth, number> = {
  'No Data': -1,
  Healthy: 0,
  Watch: 1,
  Risk: 2,
  Critical: 3,
};

export function healthOf(input: {
  project: MProject;
  statusCat: string;
  tasks: MTask[];
  milestones: MMilestone[];
  taskMap: Map<string, MTask>;
  approvals: MApproval[];
  consumed: number;
  progress: number;
  overCapacity: string[]; // names of involved people over capacity this week
  capacityKnown: boolean;
  today: string;
}): HealthResult {
  const {
    project: p,
    tasks,
    milestones,
    taskMap,
    approvals,
    consumed,
    progress,
    today,
  } = input;
  if (input.statusCat === 'Closed') {
    return {
      health: 'No Data',
      dims: dimList([
        'No Data',
        'No Data',
        'No Data',
        'No Data',
        'No Data',
        'No Data',
      ]),
      why: `No Data — the project is ${p.status.toLowerCase()}, so health is not scored.`,
    };
  }
  if (!tasks.length) {
    return {
      health: 'No Data',
      dims: dimList([
        'No Data',
        'No Data',
        p.budget == null ? 'No Data' : 'Healthy',
        'No Data',
        'No Data',
        'No Data',
      ]),
      why: `No Data — no tasks yet${p.budget == null ? ' and no budget is set' : ''}, so health cannot be scored.`,
    };
  }
  const reasons: string[] = [];
  // Schedule
  const overdue = tasks.filter((t) => isOverdue(t, today));
  const msStat = milestones.map((m) => ({
    m,
    s: milestoneStatus(m, taskMap, today),
  }));
  const msOverdue = msStat.filter((x) => x.s === 'Overdue');
  const msRisk = msStat.filter((x) => x.s === 'At Risk');
  const pastDue =
    input.statusCat !== 'Done' && !!p.dueDate && p.dueDate < today;
  let schedule: DimHealth = 'Healthy';
  if (pastDue || msOverdue.some((x) => dayDiff(today, x.m.plannedDate) > 7))
    schedule = 'Critical';
  else if (msOverdue.length || overdue.length >= 4) schedule = 'Risk';
  else if (overdue.length || msRisk.length) schedule = 'Watch';
  if (pastDue) reasons.push(`past its ${p.dueDate} due date`);
  if (overdue.length)
    reasons.push(
      `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue`,
    );
  if (msOverdue.length)
    reasons.push(`milestone “${msOverdue[0].m.name}” is overdue`);
  else if (msRisk.length)
    reasons.push(`milestone “${msRisk[0].m.name}” is at risk`);
  const blocked = tasks.filter((t) => isBlocked(t));
  if (blocked.length) reasons.push(`${blocked.length} blocked`);
  // Scope
  const openScope = approvals.filter(
    (a) =>
      a.type === 'Scope Change' &&
      ['Sent', 'Viewed', 'Changes Requested'].includes(a.status),
  ).length;
  const scope: DimHealth =
    openScope >= 2 ? 'Risk' : openScope ? 'Watch' : 'Healthy';
  if (openScope)
    reasons.push(`${openScope} open scope change${openScope > 1 ? 's' : ''}`);
  // Budget
  let budget: DimHealth = 'No Data';
  if (p.budget != null && p.budget > 0) {
    const ratio = consumed / p.budget;
    const prog = progress / 100;
    budget =
      ratio > 1 || ratio > prog + 0.25
        ? 'Critical'
        : ratio > prog + 0.15
          ? 'Risk'
          : ratio > prog + 0.05
            ? 'Watch'
            : 'Healthy';
    if (budget !== 'Healthy')
      reasons.push(
        `${Math.round(ratio * 100)}% of budget used at ${progress}% progress`,
      );
  }
  // Resources
  let resources: DimHealth = input.capacityKnown ? 'Healthy' : 'No Data';
  if (input.overCapacity.length) {
    resources = input.overCapacity.length > 1 ? 'Risk' : 'Watch';
    reasons.push(`${input.overCapacity.join(', ')} over capacity`);
  }
  // Client
  const clientOpen = approvals.filter((a) => a.approverKind === 'client');
  const clientOverdue = clientOpen.filter(
    (a) =>
      ['Sent', 'Viewed'].includes(a.status) && a.dueDate && a.dueDate < today,
  ).length;
  const clientRejected = clientOpen.filter(
    (a) => a.status === 'Rejected',
  ).length;
  const clientChanges = clientOpen.filter(
    (a) => a.status === 'Changes Requested',
  ).length;
  const client: DimHealth =
    clientRejected || clientOverdue > 1
      ? 'Risk'
      : clientOverdue || clientChanges
        ? 'Watch'
        : 'Healthy';
  if (clientOverdue)
    reasons.push(
      `${clientOverdue} client approval${clientOverdue > 1 ? 's' : ''} past due`,
    );
  if (clientChanges)
    reasons.push(`client requested changes on ${clientChanges}`);
  // Quality — work sitting in review past its due date
  const staleReview = tasks.filter(
    (t) => t.status === 'In Review' && t.dueDate && t.dueDate < today,
  ).length;
  const quality: DimHealth =
    staleReview >= 3 ? 'Risk' : staleReview ? 'Watch' : 'Healthy';
  if (staleReview) reasons.push(`${staleReview} in review past due`);

  const values: DimHealth[] = [
    schedule,
    scope,
    budget,
    resources,
    client,
    quality,
  ];
  const worst = values.reduce<DimHealth>(
    (a, b) => (RANK[b] > RANK[a] ? b : a),
    'Healthy',
  );
  const health: Health =
    worst === 'Risk' ? 'At Risk' : worst === 'No Data' ? 'Healthy' : worst;
  const why = reasons.length
    ? `${health} — ${reasons.join(', ')}.`
    : `${health} — nothing is overdue, blocked or over budget.`;
  return { health, dims: dimList(values), why };
}

function dimList(v: DimHealth[]) {
  return ['Schedule', 'Scope', 'Budget', 'Resources', 'Client', 'Quality'].map(
    (dim, i) => ({ dim, v: v[i] }),
  );
}

/** Transitive dependents of a task (tasks that wait on it, directly or indirectly). */
export function dependentsOf(id: string, tasks: MTask[]): string[] {
  const out: string[] = [];
  const walk = (x: string) =>
    tasks.forEach((t) => {
      if (t.deps.includes(x) && !out.includes(t.id)) {
        out.push(t.id);
        walk(t.id);
      }
    });
  walk(id);
  return out;
}

/** Would adding "from depends on to" close a loop? */
export function wouldCycle(
  from: string,
  to: string,
  tasks: Array<{ id: string; deps: string[] }>,
): boolean {
  const map = new Map(tasks.map((t) => [t.id, t.deps]));
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    (map.get(n) ?? []).forEach((d) => stack.push(d));
  }
  return false;
}

/**
 * Critical path: the longest chain (by duration in days) of open tasks linked by dependencies,
 * computed per project. Only tasks that sit on a dependency chain can be critical.
 */
export function criticalPath(tasks: MTask[]): Set<string> {
  const open = tasks.filter(isOpenTask);
  const byId = new Map(open.map((t) => [t.id, t]));
  const dur = (t: MTask) =>
    t.startDate && t.dueDate
      ? Math.max(dayDiff(t.dueDate, t.startDate) + 1, 1)
      : Math.max(1, Math.ceil(t.estimateMins / 480));
  const memo = new Map<string, { len: number; path: string[] }>();
  const longest = (
    id: string,
    guard: Set<string>,
  ): { len: number; path: string[] } => {
    if (memo.has(id)) return memo.get(id)!;
    const t = byId.get(id)!;
    let best = { len: 0, path: [] as string[] };
    for (const d of t.deps) {
      if (!byId.has(d) || guard.has(d)) continue;
      guard.add(d);
      const r = longest(d, guard);
      guard.delete(d);
      if (r.len > best.len) best = r;
    }
    const res = { len: best.len + dur(t), path: [...best.path, id] };
    memo.set(id, res);
    return res;
  };
  const crit = new Set<string>();
  const projects = new Set(open.map((t) => t.projectId));
  for (const pid of projects) {
    const linked = open.filter(
      (t) =>
        t.projectId === pid &&
        (t.deps.some((d) => byId.has(d)) ||
          open.some((x) => x.deps.includes(t.id))),
    );
    let best = { len: 0, path: [] as string[] };
    for (const t of linked) {
      const r = longest(t.id, new Set([t.id]));
      if (r.len > best.len) best = r;
    }
    if (best.path.length > 1) best.path.forEach((id) => crit.add(id));
  }
  return crit;
}

export interface RiskItem {
  sev: 'HIGH' | 'MED' | 'LOW';
  t: string;
  d: string;
  pid: string;
  ev: string;
  conf: string;
  view: string;
}

export function riskList(input: {
  projects: Array<
    MProject & { progress: number; consumed: number; statusCat: string }
  >;
  tasks: MTask[];
  milestones: MMilestone[];
  taskMap: Map<string, MTask>;
  workload: Array<{
    id: string;
    name: string;
    hours: number;
    capacity: number | null;
  }>;
  today: string;
  canSeeFinancials: boolean;
}): RiskItem[] {
  const out: RiskItem[] = [];
  const live = input.projects.filter(
    (p) => p.statusCat !== 'Done' && p.statusCat !== 'Closed',
  );
  for (const p of live) {
    const pt = input.tasks.filter((t) => t.projectId === p.id);
    const bl = pt.filter(isBlocked);
    if (bl.length) {
      const down = new Set(bl.flatMap((t) => dependentsOf(t.id, pt)));
      const ms = input.milestones
        .filter(
          (m) =>
            m.projectId === p.id &&
            m.status !== 'Completed' &&
            m.status !== 'Cancelled',
        )
        .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
      const days = Math.max(
        0,
        ...bl.map((t) =>
          t.dueDate && t.dueDate < input.today
            ? dayDiff(input.today, t.dueDate)
            : 0,
        ),
      );
      out.push({
        sev: 'HIGH',
        t:
          bl.length === 1
            ? `${bl[0].title} blocked${bl[0].blockType ? ' · ' + bl[0].blockType : ''}${days ? ` ${days} day${days > 1 ? 's' : ''} past due` : ''}`
            : `${p.name}: ${bl.length} blocked tasks`,
        d: `Blocks ${down.size} downstream task${down.size === 1 ? '' : 's'} on ${p.name}.${ms ? ` ${ms.name} ${usDate(ms.plannedDate)}.` : ''}`,
        pid: p.id,
        ev: bl.map((t) => t.number).join(', '),
        conf: 'High — from task blocker state',
        view: 'Blocked',
      });
    }
    if (
      input.canSeeFinancials &&
      p.budget != null &&
      p.budget > 0 &&
      p.consumed / p.budget > p.progress / 100 + 0.15
    ) {
      out.push({
        sev: 'MED',
        t: 'Budget ahead of progress',
        d: `${p.name}: ${Math.round((p.consumed / p.budget) * 100)}% used at ${p.progress}% progress.`,
        pid: p.id,
        ev: 'Approved time at snapshot rates vs task-count progress',
        conf: 'Medium — only approved time counts toward consumption',
        view: 'All Tasks',
      });
    }
  }
  for (const w of input.workload) {
    if (w.capacity != null && w.capacity > 0 && w.hours > w.capacity) {
      const pid =
        input.tasks.find((t) => t.assigneeId === w.id && isOpenTask(t))
          ?.projectId ??
        live[0]?.id ??
        '';
      out.push({
        sev: 'MED',
        t: `${w.name} over capacity`,
        d: `${round1(w.hours)} estimated hrs due this week vs ${round1(w.capacity)} scheduled.`,
        pid,
        ev: 'Open task estimates minus logged time vs scheduled shifts',
        conf: 'Medium — estimates may be stale',
        view: 'All Tasks',
      });
    }
  }
  const noBudget = live.filter((p) => p.budget == null);
  if (input.canSeeFinancials && noBudget.length) {
    out.push({
      sev: 'LOW',
      t: `No budget on ${noBudget.length === 1 ? noBudget[0].name : noBudget.length + ' projects'}`,
      d: 'Budget health cannot be scored until a budget reference is set.',
      pid: noBudget[0].id,
      ev: 'Project budget field empty',
      conf: 'High',
      view: 'All Tasks',
    });
  }
  const rank = { HIGH: 0, MED: 1, LOW: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

export function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export const WIP = WIP_LIMIT;

/** mm/dd/yyyy — the date format every Projects screen uses. */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
