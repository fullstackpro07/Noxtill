import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { UsageModule } from '../usage/usage.module';
import { BillingModule } from '../billing/billing.module';
import { BusinessModulesModule } from '../business-modules/business-modules.module';
import { SuperAdminGuard } from './super-admin.guard';
import { AdminSecretCipherService } from './admin-secret-cipher.service';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminRolesSeedService } from './services/admin-roles-seed.service';
import { AdminTenantsService } from './services/admin-tenants.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBillingService } from './services/admin-billing.service';
import { AdminEntitlementsService } from './services/admin-entitlements.service';
import { AdminMonitoringService } from './services/admin-monitoring.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminAdminsService } from './services/admin-admins.service';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminTenantsController } from './controllers/admin-tenants.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminPlatformController } from './controllers/admin-platform.controller';
import { AdminAdminsController } from './controllers/admin-admins.controller';

/**
 * Super Admin Control Center (docs: Noxtill_Super_Admin_Dashboard_PRD.md). A separate,
 * privileged administration API at `/api/v1/super-admin/*` for internal Noxtill administrators.
 * Its own identity (platform_admins), sessions, MFA and permission model — never the tenant ones.
 */
@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    UsageModule,
    BillingModule,
    BusinessModulesModule,
  ],
  controllers: [
    AdminAuthController,
    AdminTenantsController,
    AdminUsersController,
    AdminPlatformController,
    AdminAdminsController,
  ],
  providers: [
    SuperAdminGuard,
    AdminSecretCipherService,
    AdminAuthService,
    AdminAuditService,
    AdminRolesSeedService,
    AdminTenantsService,
    AdminUsersService,
    AdminBillingService,
    AdminEntitlementsService,
    AdminMonitoringService,
    AdminDashboardService,
    AdminAdminsService,
  ],
  exports: [AdminAuthService],
})
export class SuperAdminModule {}
