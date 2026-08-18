import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  describeDatabaseTarget,
  resolveDatabaseUrl,
} from './resolve-database-url';

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

  onModuleInit() {
    this.logger.log(
      `Prisma datasource ${describeDatabaseTarget(process.env.DATABASE_URL ?? '')}`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
