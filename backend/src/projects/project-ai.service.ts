import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { AI_ERROR_CODES } from '../ai/ai-infra.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  addDays,
  dayDiff,
  parseDay,
} from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { PROJECT_ERRORS } from './projects.constants';
import { isBlocked, isOverdue, usDate } from './projects-metrics';

export interface PlanTask {
  title: string;
  role: string;
  est: number;
}
export interface PlanPhase {
  name: string;
  days: number;
  tasks: PlanTask[];
}
export interface Plan {
  phases: PlanPhase[];
  ms: string[];
}

const ROLES = [
  'Project Manager',
  'Designer',
  'Developer',
  'QA',
  'Operations',
  'Data',
  'Marketing',
];

/**
 * AI assistance that only ever suggests. Plans come from Claude when the AI service is reachable
 * and enabled, otherwise from a deterministic rule-based planner — the response always says which.
 * Nothing is created until the person accepts. Risks and status drafts are built from records only.
 */
@Injectable()
export class ProjectAiService {
  private readonly logger = new Logger(ProjectAiService.name);

  constructor(
    private readonly ai: AiInfraService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async generatePlan(
    actor: AuthenticatedUser,
    input: {
      projectId: string;
      goal: string;
      due?: string;
      constraints?: string;
    },
  ) {
    await this.perms.assert(actor, 'Create tasks');
    await this.loader.project(input.projectId);
    const goal = (input.goal ?? '').trim();
    if (!goal)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Describe the goal and scope first.',
        HttpStatus.BAD_REQUEST,
      );
    let plan: Plan | null = null;
    let source = 'rule-based planner (AI service unavailable)';
    try {
      const res = await this.ai.createMessage(
        this.ctx.businessId(),
        'projects_plan',
        {
          system:
            'You plan small-business projects. Reply with strict JSON only, no prose.',
          messages: [
            {
              role: 'user',
              content: `Create a project plan as strict JSON only. Shape: {"phases":[{"name":string,"days":number,"tasks":[{"title":string,"role":${ROLES.map((r) => `"${r}"`).join('|')},"est":number}]}],"ms":[string]}. 3-6 phases, 2-5 tasks each, est in hours, 1-3 milestones. Do not invent completed work, budgets or approvals. Goal: ${goal}. Deadline: ${input.due || 'not set'}. Constraints: ${input.constraints || 'none'}.`,
            },
          ],
          temperature: 0.3,
          maxTokens: 1500,
        },
      );
      const text = res.content.find((b) => b.type === 'text')?.text ?? '';
      plan = parsePlan(text);
      if (plan) source = 'Claude, from your goal, deadline and constraints';
    } catch (e) {
      if (
        e instanceof AppException &&
        (e.getResponse() as { code?: string }).code ===
          AI_ERROR_CODES.FEATURE_DISABLED
      )
        source =
          'rule-based planner (AI assistant is switched off in AI Settings)';
      else this.logger.warn(`project plan AI failed: ${(e as Error).message}`);
    }
    if (!plan) plan = rulePlan(goal);
    return { plan, source };
  }

  async acceptPlan(
    actor: AuthenticatedUser,
    input: { projectId: string; plan: Plan; due?: string },
  ) {
    await this.perms.assert(actor, 'Create tasks');
    const p = await this.loader.project(input.projectId);
    const plan = sanitizePlan(input.plan);
    const taskN = plan.phases.reduce((a, ph) => a + ph.tasks.length, 0);
    if (!taskN)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'The plan has no tasks.',
        HttpStatus.BAD_REQUEST,
      );
    const today = await this.ctx.today();
    const start = addDays(today, 1);
    const spread = spreadPhases(plan, start, input.due);
    const members = await this.ctx.db.projectMember.findMany({
      where: { projectId: p.id },
    });
    const people = await this.ctx.people();
    const who = (role: string) => {
      if (role === 'Project Manager') return p.managerId;
      const m = members.find((x) =>
        x.roleLabel.toLowerCase().includes(role.toLowerCase()),
      );
      return m?.businessUserId ?? p.managerId;
    };
    const created = await this.ctx.raw.$transaction(
      async (tx) => {
        const ids: Array<{ id: string; due: string }> = [];
        let order =
          (
            await tx.projectTask.aggregate({
              where: { projectId: p.id },
              _max: { sortOrder: true },
            })
          )._max.sortOrder ?? 0;
        for (const ph of spread) {
          let prev: string | null = null;
          const len = Math.max(dayDiff(ph.e, ph.s) + 1, 1);
          for (let i = 0; i < ph.tasks.length; i++) {
            const t = ph.tasks[i];
            const s = addDays(ph.s, Math.floor((i * len) / ph.tasks.length));
            const d = addDays(
              ph.s,
              Math.max(
                Math.floor(((i + 1) * len) / ph.tasks.length) - 1,
                Math.floor((i * len) / ph.tasks.length),
              ),
            );
            const number = await this.ctx.nextNumber('taskSeq', tx);
            const assignee = who(t.role);
            const task = await tx.projectTask.create({
              data: {
                businessId: this.ctx.businessId(),
                number,
                projectId: p.id,
                title: t.title.slice(0, 255),
                description: `${ph.name} phase · suggested by AI plan, owner by role (${t.role}).`,
                assigneeId:
                  assignee && people.some((x) => x.id === assignee && x.active)
                    ? assignee
                    : null,
                status: 'To Do',
                startDate: parseDay(s),
                dueDate: parseDay(d),
                baselineStart: parseDay(s),
                baselineDue: parseDay(d),
                estimateMins: Math.round(t.est * 60),
                sortOrder: ++order,
                createdById: actor.sub,
              },
            });
            if (prev)
              await tx.projectTaskDependency.create({
                data: {
                  businessId: this.ctx.businessId(),
                  taskId: task.id,
                  dependsOnTaskId: prev,
                },
              });
            prev = task.id;
            ids.push({ id: task.id, due: d });
          }
        }
        let msCount = 0;
        for (let i = 0; i < plan.ms.length; i++) {
          const ph =
            spread[
              Math.min(
                spread.length - 1,
                i === plan.ms.length - 1 ? spread.length - 1 : i + 1,
              )
            ];
          const number = await this.ctx.nextNumber('msSeq', tx);
          const ms = await tx.projectMilestone.create({
            data: {
              businessId: this.ctx.businessId(),
              number,
              projectId: p.id,
              name: plan.ms[i].slice(0, 191),
              ownerId: p.managerId,
              plannedDate: parseDay(ph.e)!,
              description: 'Created from AI plan.',
            },
          });
          const linked = ids.filter((x) => x.due <= ph.e).slice(-3);
          if (linked.length)
            await tx.projectMilestoneTask.createMany({
              data: linked.map((x) => ({
                businessId: this.ctx.businessId(),
                milestoneId: ms.id,
                taskId: x.id,
              })),
            });
          msCount++;
        }
        return { tasks: ids.length, milestones: msCount };
      },
      { timeout: 60000 },
    );
    await this.ctx.activity(
      actor,
      'task.created',
      `accepted an AI plan for ${p.name} (${created.tasks} tasks)`,
      { projectId: p.id },
    );
    return created;
  }

  /** Status update draft built only from recorded tasks, milestones and blockers. */
  async statusDraft(
    actor: AuthenticatedUser,
    projectId: string,
    audience: 'Internal' | 'Client',
  ) {
    const L = await this.loader.load(actor);
    const p = L.projects.find((x) => x.id === projectId);
    if (!p)
      throw new AppException(
        PROJECT_ERRORS.NOT_FOUND,
        'Project not found',
        HttpStatus.NOT_FOUND,
      );
    const client = audience === 'Client';
    const pt = L.tasks.filter(
      (t) => t.projectId === p.id && t.status !== 'Cancelled',
    );
    const done = pt.filter((t) => t.status === 'Done');
    const blk = pt.filter(isBlocked);
    const od = pt.filter((t) => isOverdue(t, L.today));
    const nm = L.milestones
      .filter(
        (m) =>
          m.projectId === p.id &&
          m.status !== 'Completed' &&
          m.status !== 'Cancelled',
      )
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
    const visible = client ? pt.filter((t) => t.clientVisible) : pt;
    const lines = [
      `${p.name} — status update (${usDate(L.today)})`,
      '',
      `Progress: ${p.progress}% complete. ${done.length} of ${pt.length} tracked tasks done.`,
      nm
        ? `Next milestone: ${nm.name} on ${usDate(nm.plannedDate)}.`
        : 'No upcoming milestone scheduled.',
      '',
      blk.length
        ? client
          ? `Waiting on: ${
              blk
                .filter((t) => t.clientVisible)
                .map((t) => t.title)
                .join('; ') || 'a few internal items'
            }. We’ll update you as soon as this clears.`
          : `Blocked: ${blk.map((t) => `${t.number} ${t.title} (${t.blockType || 'blocked'})`).join('; ')}.`
        : 'No open blockers.',
    ];
    if (!client && od.length)
      lines.push(
        `Overdue: ${od.length} task${od.length > 1 ? 's' : ''} (${od.map((t) => t.number).join(', ')}).`,
      );
    if (!client && p.budget)
      lines.push(
        `Budget: ${Math.round(((p.consumed ?? 0) / p.budget) * 100)}% used.`,
      );
    lines.push(
      '',
      `Next steps: ${
        visible
          .filter((t) => t.status === 'In Progress')
          .slice(0, 3)
          .map((t) => t.title)
          .join('; ') || 'plan next tasks'
      }.`,
    );
    return { text: lines.join('\n') };
  }
}

function parsePlan(text: string): Plan | null {
  try {
    const j = JSON.parse(
      text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
    ) as Plan;
    if (!j.phases?.length) return null;
    return sanitizePlan(j);
  } catch {
    return null;
  }
}

function sanitizePlan(j: Plan): Plan {
  return {
    phases: (j.phases ?? [])
      .slice(0, 6)
      .map((p) => ({
        name: String(p.name ?? 'Phase').slice(0, 80),
        days: Math.max(1, Math.min(120, Number(p.days) || 5)),
        tasks: (p.tasks ?? [])
          .slice(0, 8)
          .map((t) => ({
            title: String(t.title ?? '').slice(0, 200),
            role: ROLES.includes(t.role) ? t.role : 'Project Manager',
            est: Math.max(1, Math.min(200, Number(t.est) || 2)),
          }))
          .filter((t) => t.title.trim()),
      }))
      .filter((p) => p.tasks.length),
    ms: (j.ms ?? [])
      .slice(0, 3)
      .map((m) => String(m).slice(0, 120))
      .filter(Boolean),
  };
}

export function spreadPhases(plan: Plan, start: string, due?: string) {
  const tot = plan.phases.reduce((a, p) => a + p.days, 0);
  const span =
    due && /^\d{4}-\d{2}-\d{2}$/.test(due)
      ? Math.max(dayDiff(due, start), tot)
      : tot;
  let cur = 0;
  return plan.phases.map((p) => {
    const a = cur;
    cur += (p.days / tot) * span;
    return {
      ...p,
      s: addDays(start, Math.round(a)),
      e: addDays(start, Math.max(Math.round(cur) - 1, Math.round(a))),
    };
  });
}

/** Deterministic planner used when the AI service is off or unreachable (same rules as the design). */
export function rulePlan(goal: string): Plan {
  const g = goal.toLowerCase();
  const has = (...w: string[]) => w.some((x) => g.includes(x));
  const phases: Array<{
    name: string;
    days: number;
    tasks: Array<[string, string, number]>;
  }> = [
    {
      name: 'Discovery',
      days: 5,
      tasks: [
        ['Kickoff with stakeholders', 'Project Manager', 2],
        ['Confirm scope and success criteria', 'Project Manager', 3],
      ],
    },
  ];
  if (has('app', 'website', 'portal', 'software', 'site'))
    phases.push(
      {
        name: 'Design',
        days: 10,
        tasks: [
          ['User flows', 'Designer', 6],
          ['Visual design', 'Designer', 10],
          ['Design sign-off', 'Project Manager', 1],
        ],
      },
      {
        name: 'Build',
        days: 20,
        tasks: [
          ['Core features', 'Developer', 24],
          ['Integrations', 'Developer', 12],
          ['Content load', 'Operations', 6],
        ],
      },
      {
        name: 'QA',
        days: 7,
        tasks: [
          ['Test plan', 'QA', 4],
          ['Regression testing', 'QA', 10],
        ],
      },
    );
  else if (has('store', 'opening', 'location', 'branch'))
    phases.push(
      {
        name: 'Site prep',
        days: 15,
        tasks: [
          ['Permits', 'Operations', 6],
          ['Contractor schedule', 'Operations', 4],
        ],
      },
      {
        name: 'Staffing',
        days: 10,
        tasks: [
          ['Hiring plan', 'Project Manager', 4],
          ['Staff training', 'Operations', 8],
        ],
      },
    );
  else if (has('campaign', 'marketing', 'launch', 'loyalty', 'promo'))
    phases.push(
      {
        name: 'Creative',
        days: 10,
        tasks: [
          ['Creative brief', 'Marketing', 4],
          ['Assets and copy', 'Designer', 10],
        ],
      },
      {
        name: 'Channels',
        days: 7,
        tasks: [
          ['Email and social schedule', 'Marketing', 5],
          ['In-store signage', 'Operations', 3],
        ],
      },
    );
  else
    phases.push({
      name: 'Execution',
      days: 15,
      tasks: [
        ['Workstream plan', 'Project Manager', 4],
        ['Deliver core work', 'Operations', 16],
      ],
    });
  phases.push({
    name: 'Launch',
    days: 4,
    tasks: [
      ['Go-live checklist', 'Project Manager', 3],
      ['Post-launch review', 'Project Manager', 2],
    ],
  });
  return {
    phases: phases.map((p) => ({
      name: p.name,
      days: p.days,
      tasks: p.tasks.map(([title, role, est]) => ({ title, role, est })),
    })),
    ms: [phases[1].name + ' complete', 'Launch'],
  };
}
