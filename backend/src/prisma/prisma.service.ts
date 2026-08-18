import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './resolve-database-url';

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
  constructor() {
    super({ datasources: { db: { url: resolveDatabaseUrl() } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
