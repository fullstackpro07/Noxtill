import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ datasources: { db: { url: resolveDatabaseUrl() } } });
  }

  async onModuleInit() {
    // Prisma connects lazily on the first query — no need to await $connect()
    // here. Doing so blocks NestJS module init and prevents app.listen() from
    // being called within Hostinger's 3-second startup window.
    this.logger.log(
      'PrismaService initialized (lazy connect — will connect on first query)',
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
