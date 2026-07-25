import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from './tenant.constants';
import type { RequestWithUser } from './auth-context';

/**
 * Binds the authenticated user's businessId/userId/role into CLS so
 * TenantPrismaService can auto-scope every query for the rest of the
 * request lifecycle. Must run AFTER JwtAuthGuard (which populates
 * request.user) — order matters in the global APP_GUARD array.
 *
 * Branch scoping (BE-059): an `X-Branch` header or `?branch=` query param
 * lets a parent business operate directly within one of its own branches
 * for the request — e.g. an owner ringing up a sale physically at a branch
 * rather than head office. The requested branch is only honored if it IS
 * the caller's own business or a direct child of it (`parentId` match);
 * anything else is silently ignored and the JWT's own businessId is used,
 * since this guard never denies access — it only threads context.
 *
 * Always returns true: this guard only threads context, it never denies
 * access. Routes with no authenticated user (public endpoints) simply run
 * without tenant scoping bound, which is correct — those handlers must
 * resolve their own business by slug/token and query explicitly.
 */
@Injectable()
export class TenancyGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (user) {
      const businessId = await this.resolveBranchId(request, user.businessId);
      this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
      this.cls.set(CLS_KEY_USER_ID, user.sub);
      this.cls.set(CLS_KEY_ROLE, user.role);
    }

    return true;
  }

  private async resolveBranchId(
    request: RequestWithUser,
    ownBusinessId: string,
  ): Promise<string> {
    const requested =
      (request.headers['x-branch'] as string | undefined) ??
      (request.query?.branch as string | undefined);
    if (!requested || requested === ownBusinessId) {
      return ownBusinessId;
    }

    const branch = await this.prisma.business.findUnique({
      where: { id: requested },
    });
    return branch && branch.parentId === ownBusinessId
      ? branch.id
      : ownBusinessId;
  }
}
