import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { BusinessModuleGuard } from './business-module.guard';
import {
  BUSINESS_MODULE_API_PATHS,
  businessModuleForApiPath,
  gatedModuleForApiPath,
  SHARED_DATA_API_PREFIXES,
} from './business-modules.constants';
import { BusinessModulesService } from './business-modules.service';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('BusinessModuleGuard', () => {
  it.each([
    ['/api/v1/commerce/risk-compliance?status=open', 'autonomous-commerce'],
    ['/api/v1/orders/123', 'orders'],
    ['/api/v1/marketing/workflows', 'marketing'],
    ['/api/v1/ads/campaigns', 'advertising'],
    ['/api/v1/assistant/chat', 'ai-assistant'],
    ['/api/v1/widgets/credit_outstanding?days=30', 'credit'],
    ['/api/v1/delivery-zones', 'deliveries'],
    ['/api/v1/roles', 'staff'],
    ['/api/v1/loyalty', 'customers'],
    ['/api/v1/loyalty-programs/loyalty-1/members', 'customers'],
    ['/api/v1/membership-plans', 'customers'],
    ['/api/v1/cash/shift/current', 'sales'],
    ['/api/v1/cash-reconciliation', 'sales'],
    ['/api/v1/rollup/dashboard', 'branches'],
    ['/api/v1/feedback/feedback-1/reply', 'reviews'],
    ['/api/v1/api-keys', 'integrations'],
  ])('maps %s to %s', (path, key) => {
    expect(businessModuleForApiPath(path)).toBe(key);
  });

  it.each([
    '/api/v1/dashboard/config',
    '/api/v1/settings/hub/categories',
    '/api/v1/business-modules',
    '/api/v1/widgets/registry',
  ])('leaves always-on or shared route %s ungated', (path) => {
    expect(businessModuleForApiPath(path)).toBeNull();
  });

  // Fast Sale's own API calls (pos-view → products/customers/credit/orders/returns/staff/cash/sales/
  // voice-sale clients). None may be blocked when the module that "owns" the data is turned off.
  it.each([
    '/api/v1/products?active=true',
    '/api/v1/customers?q=pat',
    '/api/v1/credit/customer-1/balance',
    '/api/v1/orders',
    '/api/v1/returns',
    '/api/v1/shifts/current',
    '/api/v1/staff',
    '/api/v1/cash/shift/current',
    '/api/v1/sales/held',
    '/api/v1/voice/sales/parse',
    '/api/v1/stock/movements',
    '/api/v1/ai/review-draft',
  ])('never gates shared business data %s', (path) => {
    expect(gatedModuleForApiPath(path)).toBeNull();
  });

  it.each([
    ['/api/v1/commerce/b2b', 'autonomous-commerce'],
    ['/api/v1/ai/what-if', 'business-simulator'],
    ['/api/v1/appointments', 'bookings'],
    ['/api/v1/ads/campaigns', 'advertising'],
    ['/api/v1/widgets/credit_outstanding', 'credit'],
    ['/api/v1/customer-duplicates', 'customers'],
  ])('still gates module-only feature %s', (path, key) => {
    expect(gatedModuleForApiPath(path)).toBe(key);
  });

  it('only lists shared prefixes that exist in the route map', () => {
    const known = new Set(BUSINESS_MODULE_API_PATHS.map((row) => row.prefix));
    expect([...SHARED_DATA_API_PREFIXES].filter((p) => !known.has(p))).toEqual(
      [],
    );
  });

  it('uses the authenticated business and propagates the typed disabled-module error', async () => {
    const error = new AppException(
      'BUSINESS_MODULE_DISABLED',
      'Autonomous Commerce is turned off for this business.',
      HttpStatus.FORBIDDEN,
    );
    const assertEnabled = jest.fn().mockRejectedValue(error);
    const guard = new BusinessModuleGuard({
      assertEnabled,
    } as unknown as BusinessModulesService);

    await expect(
      guard.canActivate(
        executionContext({
          method: 'GET',
          originalUrl: '/api/v1/commerce/b2b',
          user: { businessId: 'business-1' },
        }),
      ),
    ).rejects.toBe(error);
    expect(assertEnabled).toHaveBeenCalledWith(
      'business-1',
      'autonomous-commerce',
    );
  });

  it('does not block unauthenticated public callbacks', async () => {
    const assertEnabled = jest.fn();
    const guard = new BusinessModuleGuard({
      assertEnabled,
    } as unknown as BusinessModulesService);

    await expect(
      guard.canActivate(
        executionContext({
          method: 'POST',
          originalUrl: '/api/v1/voice/webhook/incoming',
        }),
      ),
    ).resolves.toBe(true);
    expect(assertEnabled).not.toHaveBeenCalled();
  });
});
