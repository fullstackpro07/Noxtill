import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsContextService } from './projects-context.service';
import {
  PERMISSION_AREAS,
  PROJECT_ERRORS,
  PROJECT_ROLES,
  PermissionArea,
  ProjectRole,
} from './projects.constants';

export interface ActorAccess {
  role: ProjectRole;
  personId: string | null;
  can: Record<PermissionArea, boolean>;
}

const DEFAULT_ROLE: Record<Role, ProjectRole> = {
  [Role.owner]: 'Owner',
  [Role.manager]: 'Project Manager',
  [Role.staff]: 'Staff',
};

/**
 * Projects' own permission layer: every staff member holds one of the 8 project roles (an explicit
 * ProjectRoleAssignment, else the default for their system role) and every endpoint checks the
 * business's 8×17 matrix server-side. A business Owner always passes — never gated out.
 */
@Injectable()
export class ProjectsPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
  ) {}

  async access(actor: AuthenticatedUser): Promise<ActorAccess> {
    const businessId = this.ctx.businessId();
    const personId = await this.ctx.actorPersonId(actor);
    let role: ProjectRole = DEFAULT_ROLE[actor.role] ?? 'Staff';
    if (actor.role !== Role.owner && personId) {
      const a = await this.prisma.projectRoleAssignment.findUnique({
        where: {
          businessId_businessUserId: { businessId, businessUserId: personId },
        },
      });
      if (
        a &&
        (PROJECT_ROLES as readonly string[]).includes(a.role) &&
        a.role !== 'Client'
      )
        role = a.role as ProjectRole;
    }
    if (actor.role === Role.owner) role = 'Owner';
    const cfg = await this.ctx.config(businessId);
    const can = {} as Record<PermissionArea, boolean>;
    for (const area of PERMISSION_AREAS)
      can[area] =
        role === 'Owner' || actor.role === Role.owner
          ? true
          : !!cfg.perms[area]?.[role];
    return { role, personId, can };
  }

  async assert(
    actor: AuthenticatedUser,
    area: PermissionArea,
  ): Promise<ActorAccess> {
    const acc = await this.access(actor);
    if (!acc.can[area]) {
      throw new AppException(
        PROJECT_ERRORS.FORBIDDEN,
        `Your project role (${acc.role}) does not allow “${area}”.`,
        HttpStatus.FORBIDDEN,
      );
    }
    return acc;
  }

  static check(acc: ActorAccess, area: PermissionArea) {
    if (!acc.can[area]) {
      throw new AppException(
        PROJECT_ERRORS.FORBIDDEN,
        `Your project role (${acc.role}) does not allow “${area}”.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Whether the actor may see this project at all (View all projects, or they are involved). */
  static canSeeProject(
    acc: ActorAccess,
    p: {
      managerId: string | null;
      visibility: string;
      createdById: string | null;
    },
    involved: boolean,
    actorUserId: string,
  ): boolean {
    if (acc.role === 'Owner') return true;
    const mine =
      involved ||
      (!!acc.personId && p.managerId === acc.personId) ||
      p.createdById === actorUserId;
    if (p.visibility === 'Private') return mine;
    return acc.can['View all projects'] || mine;
  }
}
