import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  ALL_CAPABILITIES,
  Capability,
  SYSTEM_ROLE_CAPABILITIES,
} from '../common/capabilities/capabilities.constants';
import { SYSTEM_ROLE_OVERRIDE_ERROR_CODES } from './roles.constants';

const OVERRIDABLE_ROLES = [Role.manager, Role.staff] as const;
export type OverridableRole = (typeof OVERRIDABLE_ROLES)[number];

/**
 * Real per-business overrides of the Manager/Staff system-role capability sets (UPD-BE-STAFF-01).
 * Owner is deliberately excluded everywhere in this service, matching the same anti-lockout
 * guarantee `CapabilitiesService.resolve` enforces at read time — there is no code path here that
 * can ever write an owner override.
 */
@Injectable()
export class SystemRoleOverridesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  static parseOverridableRole(value: string): OverridableRole {
    if (value === Role.manager || value === Role.staff) {
      return value;
    }
    throw new AppException(
      SYSTEM_ROLE_OVERRIDE_ERROR_CODES.OWNER_NOT_OVERRIDABLE,
      'Only the Manager and Staff roles can be changed here — Owner always keeps every capability',
      HttpStatus.BAD_REQUEST,
    );
  }

  async list(businessId: string) {
    const overrides = await this.tenantPrisma.client.roleCapabilityOverride.findMany({
      where: { businessId, role: { in: OVERRIDABLE_ROLES as unknown as Role[] } },
    });
    const overrideByRole = new Map(overrides.map((o) => [o.role, o]));

    return OVERRIDABLE_ROLES.map((role) => {
      const override = overrideByRole.get(role);
      return {
        role,
        capabilities: (override
          ? (override.capabilities as unknown as Capability[])
          : SYSTEM_ROLE_CAPABILITIES[role]),
        isOverridden: !!override,
      };
    });
  }

  async update(businessId: string, roleParam: string, capabilities: string[]) {
    const role = SystemRoleOverridesService.parseOverridableRole(roleParam);
    this.assertKnownCapabilities(capabilities);

    const before = await this.effectiveFor(businessId, role);
    const saved = await this.tenantPrisma.client.roleCapabilityOverride.upsert({
      where: { businessId_role: { businessId, role } },
      create: { businessId, role, capabilities },
      update: { capabilities },
    });
    await this.audit.log({
      entity: 'role_capability_override',
      entityId: saved.id,
      action: 'role_capability.update',
      before: { role, capabilities: before },
      after: { role, capabilities },
    });

    return { role, capabilities: saved.capabilities as unknown as Capability[], isOverridden: true };
  }

  async reset(businessId: string, roleParam: string) {
    const role = SystemRoleOverridesService.parseOverridableRole(roleParam);
    const existing = await this.tenantPrisma.client.roleCapabilityOverride.findUnique({
      where: { businessId_role: { businessId, role } },
    });
    if (existing) {
      const before = existing.capabilities as unknown as Capability[];
      await this.tenantPrisma.client.roleCapabilityOverride.delete({
        where: { id: existing.id },
      });
      await this.audit.log({
        entity: 'role_capability_override',
        entityId: existing.id,
        action: 'role_capability.reset',
        before: { role, capabilities: before },
        after: { role, capabilities: SYSTEM_ROLE_CAPABILITIES[role] },
      });
    }
    return { role, capabilities: SYSTEM_ROLE_CAPABILITIES[role], isOverridden: false };
  }

  private async effectiveFor(
    businessId: string,
    role: OverridableRole,
  ): Promise<Capability[]> {
    const existing = await this.tenantPrisma.client.roleCapabilityOverride.findUnique({
      where: { businessId_role: { businessId, role } },
    });
    return existing
      ? (existing.capabilities as unknown as Capability[])
      : SYSTEM_ROLE_CAPABILITIES[role];
  }

  private assertKnownCapabilities(capabilities: string[]): void {
    const unknown = capabilities.filter(
      (c) => !ALL_CAPABILITIES.includes(c as (typeof ALL_CAPABILITIES)[number]),
    );
    if (unknown.length > 0) {
      throw new AppException(
        SYSTEM_ROLE_OVERRIDE_ERROR_CODES.UNKNOWN_CAPABILITY,
        `Unknown capability key(s): ${unknown.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
