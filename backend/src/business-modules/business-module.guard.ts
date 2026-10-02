import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RequestWithUser } from '../common/tenancy/auth-context';
import { gatedModuleForApiPath } from './business-modules.constants';
import { BusinessModulesService } from './business-modules.service';

/**
 * Enforces module selection for authenticated business APIs. Public webhooks and public customer
 * pages have no authenticated tenant context here and keep their existing provider/public flow.
 * Dashboard, Settings, the module-list endpoint and shared business data (products, customers,
 * orders, credit, stock, staff…) always pass — see `SHARED_DATA_API_PREFIXES`.
 */
@Injectable()
export class BusinessModuleGuard implements CanActivate {
  constructor(private readonly modules: BusinessModulesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.method === 'OPTIONS' || !request.user) return true;

    const moduleKey = gatedModuleForApiPath(request.originalUrl || request.url);
    if (!moduleKey) return true;

    await this.modules.assertEnabled(request.user.businessId, moduleKey);
    return true;
  }
}
