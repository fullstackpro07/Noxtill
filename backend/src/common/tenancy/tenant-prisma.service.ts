import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantScopingExtension } from './tenant-prisma.extension';

/**
 * Tenant-scoped Prisma client. Use this (not the raw PrismaService) in every
 * feature module — it auto-injects business_id from the authenticated
 * request's CLS context on every query against a tenant-scoped model (BE-006).
 */
function extendClient(prisma: PrismaService, cls: ClsService) {
  return prisma.$extends(tenantScopingExtension(cls));
}

@Injectable()
export class TenantPrismaService {
  readonly client: ReturnType<typeof extendClient>;

  constructor(prisma: PrismaService, cls: ClsService) {
    this.client = extendClient(prisma, cls);
  }
}
