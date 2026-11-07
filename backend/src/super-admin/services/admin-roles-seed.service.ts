import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_ADMIN_ROLES, SUPER_ADMIN_ROLE } from '../super-admin.constants';

/**
 * Creates any missing system admin role on boot. Never overwrites an existing role's permissions
 * (an operator may have edited them) — except `super_admin`, which always holds every permission.
 */
@Injectable()
export class AdminRolesSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminRolesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureRoles();
    } catch (error) {
      this.logger.warn(`Admin roles not seeded: ${(error as Error).message}`);
    }
  }

  async ensureRoles() {
    for (const role of SYSTEM_ADMIN_ROLES) {
      await this.prisma.platformAdminRole.upsert({
        where: { key: role.key },
        create: {
          key: role.key,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: true,
        },
        update:
          role.key === SUPER_ADMIN_ROLE
            ? { permissions: role.permissions, isSystem: true }
            : {},
      });
    }
  }
}
