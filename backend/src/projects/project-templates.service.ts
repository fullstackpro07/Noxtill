import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsContextService } from './projects-context.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import {
  BILLING_TYPES,
  PRIORITIES,
  PROJECT_AUTOMATION_HOOKS,
  PROJECT_ERRORS,
} from './projects.constants';

export interface TemplateInput {
  name: string;
  category?: string;
  businessType?: string;
  billing?: string;
  priority?: string;
  phases?: Array<{ name: string; days: number; tasks: string[] }>;
  milestones?: string[];
  roles?: string[];
  docs?: string;
  hooks?: string[];
  chain?: boolean;
  taskChain?: boolean;
  publish?: boolean;
}

const CATEGORIES = [
  'Client delivery',
  'Internal',
  'Marketing',
  'Operations',
  'Development',
];

@Injectable()
export class ProjectTemplatesService {
  constructor(
    private readonly ctx: ProjectsContextService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async list() {
    const rows = await this.ctx.db.projectTemplate.findMany({
      where: { status: { not: 'Archived' } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((t) => {
      const phases = (Array.isArray(t.phases) ? t.phases : []) as Array<{
        name: string;
        days: number;
        tasks: string[];
      }>;
      const defaults = (t.defaults ?? {}) as {
        billing?: string;
        priority?: string;
      };
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        businessType: t.businessType,
        status: t.status,
        phases,
        milestones: (Array.isArray(t.milestones)
          ? t.milestones
          : []) as string[],
        roles: (Array.isArray(t.roles) ? t.roles : []) as string[],
        docs: t.docs,
        hooks: (Array.isArray(t.hooks) ? t.hooks : []) as string[],
        chain: t.chain,
        taskChain: t.taskChain,
        billing: defaults.billing ?? 'Fixed',
        priority: defaults.priority ?? 'Medium',
      };
    });
  }

  private async template(id: string) {
    const t = await this.ctx.db.projectTemplate.findFirst({ where: { id } });
    if (!t)
      throw new AppException(
        PROJECT_ERRORS.TEMPLATE_NOT_FOUND,
        'Template not found',
        HttpStatus.NOT_FOUND,
      );
    return t;
  }

  async create(actor: AuthenticatedUser, input: TemplateInput) {
    await this.perms.assert(actor, 'Create projects');
    if (input.publish) await this.perms.assert(actor, 'Manage settings');
    const name = (input.name ?? '').trim();
    if (!name)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Name the template.',
        HttpStatus.BAD_REQUEST,
      );
    const phases = (input.phases ?? [])
      .map((p) => ({
        name: (p.name || '').trim().slice(0, 80) || 'Phase',
        days: Math.max(1, Math.min(365, Math.round(Number(p.days) || 5))),
        tasks: (p.tasks ?? [])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .slice(0, 40),
      }))
      .slice(0, 20);
    const t = await this.ctx.db.projectTemplate.create({
      data: {
        businessId: this.ctx.businessId(),
        name: name.slice(0, 191),
        category: CATEGORIES.includes(input.category ?? '')
          ? input.category!
          : 'Client delivery',
        businessType: (input.businessType || 'Any').slice(0, 120),
        status: input.publish ? 'Published' : 'Draft',
        defaults: {
          billing: BILLING_TYPES.includes(input.billing ?? '')
            ? input.billing
            : 'Fixed',
          priority: (PRIORITIES as readonly string[]).includes(
            input.priority ?? '',
          )
            ? input.priority
            : 'Medium',
        } as Prisma.InputJsonValue,
        phases: phases as Prisma.InputJsonValue,
        milestones: (input.milestones ?? [])
          .map((m) => m.trim())
          .filter(Boolean)
          .slice(0, 20),
        roles: (input.roles ?? []).slice(0, 20),
        docs: input.docs?.trim() || null,
        hooks: (input.hooks ?? []).filter((h) =>
          PROJECT_AUTOMATION_HOOKS.some(([k]) => k === h),
        ),
        chain: input.chain !== false,
        taskChain: !!input.taskChain,
        createdById: actor.sub,
      },
    });
    return { id: t.id, status: t.status };
  }

  async publish(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Manage settings');
    await this.template(id);
    await this.ctx.db.projectTemplate.update({
      where: { id },
      data: { status: 'Published' },
    });
    return { ok: true };
  }

  async duplicate(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Create projects');
    const t = await this.template(id);
    const copy = await this.ctx.db.projectTemplate.create({
      data: {
        businessId: this.ctx.businessId(),
        name: `${t.name} (copy)`.slice(0, 191),
        category: t.category,
        businessType: t.businessType,
        status: 'Draft',
        defaults: t.defaults as Prisma.InputJsonValue,
        phases: t.phases as Prisma.InputJsonValue,
        milestones: t.milestones as Prisma.InputJsonValue,
        roles: t.roles as Prisma.InputJsonValue,
        docs: t.docs,
        hooks: t.hooks as Prisma.InputJsonValue,
        chain: t.chain,
        taskChain: t.taskChain,
        createdById: actor.sub,
      },
    });
    return { id: copy.id };
  }

  async archive(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Manage settings');
    await this.template(id);
    await this.ctx.db.projectTemplate.update({
      where: { id },
      data: { status: 'Archived' },
    });
    return { ok: true };
  }
}
