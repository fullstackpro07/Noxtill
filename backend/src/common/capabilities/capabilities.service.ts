import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_ROLE_CAPABILITIES, Capability } from './capabilities.constants';
import { Role } from '@prisma/client';

/**
 * Resolves a `BusinessUser`'s effective capability set (UPD-BE-035) — called at login/signup
 * time only (see `AuthService.issueTokens`), never per-request, so this stays a plain
 * `PrismaService` lookup rather than adding I/O to every guarded request. A custom role's
 * capabilities completely replace (not add to) the system role's default set — assigning a
 * custom role is a deliberate, explicit choice to take over what that user can do.
 */
@Injectable()
export class CapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(businessUser: {
    role: Role;
    customRoleId: string | null;
  }): Promise<Capability[]> {
    if (!businessUser.customRoleId) {
      return SYSTEM_ROLE_CAPABILITIES[businessUser.role];
    }

    const customRole = await this.prisma.customRole.findUnique({
      where: { id: businessUser.customRoleId },
    });
    // A custom role was deleted out from under an assigned user — fail closed to the system
    // role's default rather than silently granting nothing-was-ever-checked-style broad access.
    if (!customRole) {
      return SYSTEM_ROLE_CAPABILITIES[businessUser.role];
    }

    // MySQL migration: `capabilities` is a JSON column now (Prisma's MySQL connector has no
    // native array column type), hence the double cast through `unknown`.
    return customRole.capabilities as unknown as Capability[];
  }
}
