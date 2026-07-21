import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

/**
 * Raw, unscoped Prisma client. Only inject this directly for platform-admin
 * code paths that must legitimately cross tenant boundaries (GET /admin/*,
 * backups, migrations). Everything else should use TenantPrismaService.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
