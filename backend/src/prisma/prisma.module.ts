import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';

@Global()
@Module({
  providers: [PrismaService, TenantPrismaService, BranchScopeService],
  exports: [PrismaService, TenantPrismaService, BranchScopeService],
})
export class PrismaModule {}
