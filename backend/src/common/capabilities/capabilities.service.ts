import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_ROLE_CAPABILITIES, Capability } from './capabilities.constants';
import { Role } from '@prisma/client';

/**
 * Resolves a `BusinessUser`'s effective capability set (UPD-BE-035) — called at login/signup
 * time (see `AuthService.issueTokens`) and, since the Staff module's Roles & Permissions rework
 * (UPD-BE-STAFF-01), live on every gated request for a non-owner system role too (see
 * `CapabilitiesGuard`), so a `RoleCapabilityOverride` edit takes effect on the very next request
 * rather than waiting for a token refresh — matching the guarantee custom roles already had.
 * A custom role's or an override's capabilities completely replace (not add to) the system
 * role's default set — either is a deliberate, explicit choice to take over what that user can do.
 */
@Injectable()
export class CapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(businessUser: {
    businessId: string;
    role: Role;
    customRoleId: string | null;
  }): Promise<Capability[]> {
    if (businessUser.customRoleId) {
      const customRole = await this.prisma.customRole.findUnique({
        where: { id: businessUser.customRoleId },
      });
      // A custom role was deleted out from under an assigned user — fail closed to the system
      // role's default rather than silently granting nothing-was-ever-checked-style broad access.
      if (customRole) {
        // MySQL migration: `capabilities` is a JSON column now (Prisma's MySQL connector has no
        // native array column type), hence the double cast through `unknown`.
        return customRole.capabilities as unknown as Capability[];
      }
    }

    // Owner is never overridden — always the full, hardcoded superset, same anti-lockout
    // guarantee `CustomRole` assignment already respects (an owner can never be assigned a
    // custom role either — see `StaffService.loadNonOwner`).
    if (businessUser.role === Role.owner) {
      return SYSTEM_ROLE_CAPABILITIES[Role.owner];
    }

    const override = await this.prisma.roleCapabilityOverride.findUnique({
      where: {
        businessId_role: {
          businessId: businessUser.businessId,
          role: businessUser.role,
        },
      },
    });
    if (override) {
      return override.capabilities as unknown as Capability[];
    }

    return SYSTEM_ROLE_CAPABILITIES[businessUser.role];
  }
}
