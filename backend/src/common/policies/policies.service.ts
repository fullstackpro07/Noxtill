import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../filters/app.exception';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CLS_KEY_BUSINESS_ID, CLS_KEY_ROLE, CLS_KEY_USER_ID } from '../tenancy/tenant.constants';
import { CAPABILITIES } from '../capabilities/capabilities.constants';
import { POLICY_DEFS, PolicyDef, PolicyKey, PolicyValue, isPolicyKey } from './policies.constants';

/** A business's policies with every default filled in. */
export class ResolvedPolicies {
  constructor(private readonly raw: Record<string, unknown>) {}

  private value(key: PolicyKey): PolicyValue {
    const def = POLICY_DEFS[key] as PolicyDef;
    const v = this.raw[key];
    return v === undefined ? def.default : (v as PolicyValue);
  }

  bool(key: PolicyKey): boolean {
    return this.value(key) === true;
  }

  /** `null` means "no limit / not set". */
  num(key: PolicyKey): number | null {
    const v = this.value(key);
    return typeof v === 'number' ? v : null;
  }

  time(key: PolicyKey): string | null {
    const v = this.value(key);
    return typeof v === 'string' ? v : null;
  }
}

/** Resolves a business row's policies without needing the injectable service. */
export function resolvePolicies(business: { policies?: unknown } | null | undefined): ResolvedPolicies {
  const raw = business?.policies;
  return new ResolvedPolicies(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  resolve(business: { policies?: unknown } | null | undefined): ResolvedPolicies {
    return resolvePolicies(business);
  }

  async forBusiness(businessId: string): Promise<ResolvedPolicies> {
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { policies: true } });
    return this.resolve(b);
  }

  /** The policies of the business this request is acting on (its branch when one is selected). */
  async current(): Promise<ResolvedPolicies> {
    const activeId = this.cls.get<string | undefined>(CLS_KEY_BUSINESS_ID);
    return activeId ? this.forBusiness(activeId) : resolvePolicies(null);
  }

  /** True when the owner hides cost prices and the requester is not allowed to see them. */
  async costHidden(): Promise<boolean> {
    if (!(await this.current()).bool('catalog.hideCostFromStaff')) return false;
    return !(await this.actorCan(CAPABILITIES.COST_VIEW));
  }

  /** Validates and returns the canonical value for `key`, or throws a 400 saying why not. */
  normalize(key: string, value: unknown): PolicyValue {
    if (!isPolicyKey(key)) throw new AppException('POLICY_UNKNOWN', `Unknown policy: ${key}`, HttpStatus.BAD_REQUEST);
    const def = POLICY_DEFS[key] as PolicyDef;
    const bad = (m: string) => new AppException('SETTING_INVALID', m, HttpStatus.BAD_REQUEST);
    if (def.kind === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw bad('Choose on or off.');
    }
    if (def.kind === 'time') {
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw bad('Enter a time like 21:00.');
      return value;
    }
    if (value === null || value === '') {
      if (def.kind === 'nullableNumber') return null;
      throw bad('Enter a number.');
    }
    const n = Number(value);
    if (!Number.isFinite(n)) throw bad('Enter a number.');
    if (def.integer && !Number.isInteger(n)) throw bad('Enter a whole number.');
    if (def.min !== undefined && n < def.min) throw bad(`The minimum is ${def.min}.`);
    if (def.max !== undefined && n > def.max) throw bad(`The maximum is ${def.max}.`);
    return n;
  }

  async set(businessId: string, key: string, value: unknown): Promise<PolicyValue> {
    const canonical = this.normalize(key, value);
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { policies: true } });
    const current = (b.policies && typeof b.policies === 'object' && !Array.isArray(b.policies) ? b.policies : {}) as Record<string, unknown>;
    const next = { ...current, [key]: canonical };
    await this.prisma.business.update({ where: { id: businessId }, data: { policies: next as Prisma.InputJsonValue } });
    return canonical;
  }

  /** Whether the person making this request holds `capability` (owner always does). */
  async actorCan(capability: string): Promise<boolean> {
    const role = this.cls.get<Role | undefined>(CLS_KEY_ROLE);
    if (role === Role.owner) return true;
    const userId = this.cls.get<string | undefined>(CLS_KEY_USER_ID);
    const activeId = this.cls.get<string | undefined>(CLS_KEY_BUSINESS_ID);
    if (!userId || !activeId) return false;
    const active = await this.prisma.business.findUnique({ where: { id: activeId }, select: { parentId: true } });
    const membership = await this.prisma.businessUser.findFirst({
      where: { userId, active: true, businessId: { in: [activeId, ...(active?.parentId ? [active.parentId] : [])] } },
    });
    if (!membership) return false;
    const caps = await this.capabilities.resolve({ businessId: membership.businessId, role: membership.role, customRoleId: membership.customRoleId });
    return (caps as string[]).includes(capability);
  }

  /** The role making this request, if any (background jobs have none). */
  actorRole(): Role | undefined {
    return this.cls.get<Role | undefined>(CLS_KEY_ROLE);
  }
}
