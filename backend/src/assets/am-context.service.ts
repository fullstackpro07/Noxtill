import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  AM_ERRORS,
  AmConfig,
  defaultConfig,
  mergeConfig,
} from './am.constants';

export type Tx = Prisma.TransactionClient;
export type Right =
  | 'create'
  | 'edit'
  | 'transfer'
  | 'retire'
  | 'request'
  | 'approve'
  | 'start'
  | 'complete'
  | 'pm'
  | 'cost'
  | 'export'
  | 'reading'
  | 'settings';

export interface AmActor {
  userId: string;
  name: string;
  role: 'Owner' | 'Manager' | 'Staff';
  roleLabel: string;
  rootId: string;
  businessId: string;
  create: boolean;
  edit: boolean;
  transfer: boolean;
  retire: boolean;
  request: boolean;
  approve: boolean;
  start: boolean;
  complete: boolean;
  pm: boolean;
  cost: boolean;
  export: boolean;
  reading: boolean;
  settings: boolean;
  /** Branches this person may see; null = the whole group. */
  branches: string[] | null;
  /** Can only start/complete — the work-order list defaults to "assigned to me". */
  techOnly: boolean;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (d: Prisma.Decimal | number | string | null | undefined) =>
  d == null ? 0 : Number(d);
export const dec = (n: number) => new Prisma.Decimal(r2(n).toFixed(2));
export const corrId = () => 'corr_' + randomBytes(4).toString('hex');

const CAP: Record<Right, string> = {
  create: CAPABILITIES.ASSETS_CREATE,
  edit: CAPABILITIES.ASSETS_EDIT,
  transfer: CAPABILITIES.ASSETS_TRANSFER,
  retire: CAPABILITIES.ASSETS_RETIRE,
  request: CAPABILITIES.ASSETS_REQUEST,
  approve: CAPABILITIES.ASSETS_APPROVE,
  start: CAPABILITIES.ASSETS_START,
  complete: CAPABILITIES.ASSETS_COMPLETE,
  pm: CAPABILITIES.ASSETS_PM,
  cost: CAPABILITIES.ASSETS_COST,
  export: CAPABILITIES.ASSETS_EXPORT,
  reading: CAPABILITIES.ASSETS_READING,
  settings: CAPABILITIES.ASSETS_SETTINGS,
};

export const amErr = (
  code: string,
  msg: string,
  status = HttpStatus.BAD_REQUEST,
) => new AppException(code, msg, status);

/**
 * Shared plumbing for Assets & Maintenance: the business group (records are keyed by the group
 * root, branches are Business children), the person's asset rights, versioned settings, number
 * sequences, people/team/supplier names, notifications and the append-only audit trail.
 */
@Injectable()
export class AmContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: CapabilitiesService,
  ) {}

  get db() {
    return this.prisma;
  }

  async rootOf(businessId: string): Promise<string> {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!b)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Business not found',
        HttpStatus.NOT_FOUND,
      );
    return b.parentId ?? b.id;
  }

  async branches(rootId: string) {
    const rows = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: {
        id: true,
        name: true,
        parentId: true,
        currency: true,
        timezone: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  }

  async business(rootId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: { id: true, name: true, currency: true, timezone: true },
    });
  }

  async actor(user: AuthenticatedUser): Promise<AmActor> {
    const rootId = await this.rootOf(user.businessId);
    const group = await this.branches(rootId);
    const memberships = await this.prisma.businessUser.findMany({
      where: {
        userId: user.sub,
        active: true,
        businessId: { in: group.map((g) => g.id) },
      },
      include: {
        user: { select: { name: true } },
        customRole: { select: { name: true } },
      },
    });
    const here =
      memberships.find((m) => m.businessId === user.businessId) ??
      memberships[0];
    if (!here)
      throw amErr(
        AM_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    const owner = role === Role.owner;
    let list: string[] = [];
    if (!owner)
      list = await this.caps.resolve({
        businessId: here.businessId,
        role: here.role,
        customRoleId: here.customRoleId,
      });
    const has = (c: string) => owner || list.includes(c);
    const r = Object.fromEntries(
      (Object.keys(CAP) as Right[]).map((k) => [k, has(CAP[k])]),
    ) as Record<Right, boolean>;
    if (!has(CAPABILITIES.ASSETS_VIEW) && !r.approve && !r.settings)
      throw amErr(
        AM_ERRORS.FORBIDDEN,
        'Your role doesn’t include Assets & Maintenance. Ask an Owner to grant “assets.view” in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const memberOf = memberships.map((m) => m.businessId);
    return {
      userId: user.sub,
      name: here.user.name,
      role: owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff',
      roleLabel:
        here.customRole?.name ??
        (owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff'),
      rootId,
      businessId: here.businessId,
      ...r,
      branches: owner || memberOf.includes(rootId) ? null : memberOf,
      techOnly: !owner && (r.start || r.complete) && !r.approve && !r.edit,
    };
  }

  need(a: AmActor, right: Right, what: string): void {
    if (a[right]) return;
    throw amErr(
      AM_ERRORS.FORBIDDEN,
      `PERMISSION_DENIED — ${what} needs “${CAP[right]}”, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  // ── settings & numbering ──────────────────────────────────────────────

  async ensure(rootId: string) {
    const found = await this.prisma.amSettings.findUnique({
      where: { businessId: rootId },
    });
    if (found) return found;
    try {
      return await this.prisma.amSettings.create({
        data: {
          businessId: rootId,
          config: defaultConfig() as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
    } catch {
      return this.prisma.amSettings.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
  }

  async config(rootId: string): Promise<AmConfig> {
    return mergeConfig((await this.ensure(rootId)).config);
  }

  /** Next value of a sequence, taken atomically. */
  async next(
    rootId: string,
    kind: 'nextAsset' | 'nextReq' | 'nextWo' | 'nextPm',
    tx?: Tx,
  ): Promise<number> {
    await this.ensure(rootId);
    const db = tx ?? this.prisma;
    const s = await db.amSettings.update({
      where: { businessId: rootId },
      data: { [kind]: { increment: 1 } },
    });
    return (s as unknown as Record<string, number>)[kind] - 1;
  }

  async assetNumber(rootId: string, tx?: Tx) {
    const cfg = await this.config(rootId);
    const db = tx ?? this.prisma;
    // Skip numbers taken by manual overrides so an auto number is never a duplicate.
    for (;;) {
      const n = await this.next(rootId, 'nextAsset', tx);
      const v =
        cfg.numbering.prefix + String(n).padStart(cfg.numbering.pad, '0');
      const taken = await db.amAsset.findFirst({
        where: { businessId: rootId, number: v },
        select: { id: true },
      });
      if (!taken) return v;
    }
  }

  async previewAssetNumber(rootId: string) {
    const s = await this.ensure(rootId);
    const cfg = mergeConfig(s.config);
    return (
      cfg.numbering.prefix +
      String(s.nextAsset).padStart(cfg.numbering.pad, '0')
    );
  }

  async number(rootId: string, kind: 'req' | 'wo' | 'pm', tx?: Tx) {
    const n = await this.next(
      rootId,
      ({ req: 'nextReq', wo: 'nextWo', pm: 'nextPm' } as const)[kind],
      tx,
    );
    return (
      { req: 'MR-', wo: 'MWO-', pm: 'PM-' }[kind] + String(n).padStart(3, '0')
    );
  }

  // ── people, teams, suppliers ──────────────────────────────────────────

  async members(rootId: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: group.map((g) => g.id) }, active: true },
      include: {
        user: { select: { id: true, name: true } },
        customRole: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Map<
      string,
      {
        id: string;
        name: string;
        role: string;
        label: string;
        rate: number | null;
      }
    >();
    for (const r of rows)
      if (!seen.has(r.userId))
        seen.set(r.userId, {
          id: r.userId,
          name: r.user.name,
          role: r.role,
          label:
            r.customRole?.name ??
            (r.role === Role.owner
              ? 'Owner'
              : r.role === Role.manager
                ? 'Manager'
                : 'Staff'),
          rate: r.hourlyRate == null ? null : Number(r.hourlyRate),
        });
    return [...seen.values()];
  }

  async names(rootId: string) {
    const group = await this.branches(rootId);
    const [people, teams, suppliers] = await Promise.all([
      this.members(rootId),
      this.prisma.amTeam.findMany({
        where: { businessId: rootId },
        include: { members: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.supplier.findMany({
        where: { businessId: { in: group.map((g) => g.id) } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const map = new Map<string, string>();
    people.forEach((p) => map.set(p.id, p.name));
    teams.forEach((t) => map.set(t.id, `${t.name} team`));
    suppliers.forEach((s) => map.set(s.id, s.name));
    return { map, people, teams, suppliers, group };
  }

  async notify(
    rootId: string,
    userIds: string[],
    title: string,
    body: string,
    link: string,
    exceptUserId?: string,
  ) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: {
        userId: { in: [...new Set(userIds)] },
        businessId: { in: group.map((g) => g.id) },
        active: true,
      },
      select: { userId: true, businessId: true },
    });
    const done = new Set<string>();
    for (const r of rows) {
      if (r.userId === exceptUserId || done.has(r.userId)) continue;
      done.add(r.userId);
      await this.prisma.notification
        .create({
          data: {
            businessId: r.businessId,
            userId: r.userId,
            title,
            body,
            link,
          },
        })
        .catch(() => null);
    }
    return done.size;
  }

  async roleUsers(rootId: string, roles: Role[]) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: {
        businessId: { in: group.map((g) => g.id) },
        active: true,
        role: { in: roles },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  async audit(
    rootId: string,
    a: AmActor | 'System',
    action: string,
    entityType: string,
    entityId: string,
    detail: string,
    o?: { before?: unknown; after?: unknown; corr?: string; tx?: Tx },
  ) {
    const db = o?.tx ?? this.prisma;
    await db.amAudit.create({
      data: {
        businessId: rootId,
        actorId: a === 'System' ? 'System' : a.userId,
        actorName:
          a === 'System'
            ? 'System'
            : `${a.name} (${a.roleLabel})`.slice(0, 160),
        action: action.slice(0, 80),
        entityType,
        entityId,
        detail: detail.slice(0, 2000),
        before: o?.before ?? undefined,
        after: o?.after ?? undefined,
        correlation: o?.corr ?? corrId(),
      },
    });
  }
}
