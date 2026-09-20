import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves which real business id(s) a Profit & Analytics read should query, given an optional
 * explicitly-requested branch (UPD-BE-114). "Branches" in this schema are separate sibling
 * `Business` rows linked by `parentId`, not a column on Order/Expense/Appointment — so unlike
 * every other tenant-scoped read in this codebase (which trusts `TenantPrismaService`'s
 * CLS-bound auto-scoping), a branch-aware read must resolve its own explicit business-id list and
 * use the raw `PrismaService` directly; `TenantPrismaService`'s extension would otherwise silently
 * overwrite any `businessId` it's given with the caller's own CLS value (see
 * `tenant-prisma.extension.ts`), making cross-branch reads impossible through it by design.
 *
 * `requestedBranchId` has three meanings, deliberately distinct so an internal caller that never
 * threads a branch through (e.g. `HealthScoreSnapshotProcessor` scoring one specific business in a
 * background job with no request context) keeps today's exact single-business behavior by doing
 * nothing differently:
 *  - omitted/undefined — just the caller's own business (unchanged from before this existed).
 *  - the literal string `"all"` — the caller's whole real branch group (itself, its root business
 *    if it's a branch, and every sibling under that root); the UI's "All branches" option sends
 *    this explicitly rather than relying on an omitted param, so the two cases never collide.
 *  - a specific business id — validated against that same real group before being honoured, so a
 *    business can never read a branch outside its own group.
 */
@Injectable()
export class BranchScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveIds(
    callerBusinessId: string,
    requestedBranchId?: string,
  ): Promise<string[]> {
    if (!requestedBranchId || requestedBranchId === callerBusinessId) {
      return [callerBusinessId];
    }

    const caller = await this.prisma.business.findUniqueOrThrow({
      where: { id: callerBusinessId },
      select: { id: true, parentId: true },
    });
    const rootId = caller.parentId ?? caller.id;
    const group = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true },
    });
    const groupIds = group.map((b) => b.id);

    if (requestedBranchId === 'all') return groupIds;

    if (!groupIds.includes(requestedBranchId)) {
      throw new ForbiddenException(
        'That branch is not part of your business group',
      );
    }
    return [requestedBranchId];
  }
}
