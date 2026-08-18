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

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        `Prisma connect failed (${describeDatabaseTarget(process.env.DATABASE_URL ?? '')}). ` +
          'MySQL rejected the password from Node.js Environment variables. ' +
          'Changing it under Databases does not update DATABASE_URL — edit that value in the website dashboard sidebar, Save (that redeploys), then confirm passwordChars matches the new password length.',
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
