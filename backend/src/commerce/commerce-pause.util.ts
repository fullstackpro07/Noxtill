import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export const COMMERCE_PAUSED_CODE = 'COMMERCE_ACTIONS_PAUSED';

export async function commercePaused(
  tenantPrisma: TenantPrismaService,
  businessId: string,
): Promise<boolean> {
  const business = await tenantPrisma.client.business.findUnique({
    where: { id: businessId },
    select: { policies: true },
  });
  return resolvePolicies(business).bool('commerce.actionsPaused');
}

/**
 * Commerce kill switch (`commerce.actionsPaused`). Blocks the commerce actions that reach outside
 * Noxtill or create canonical records on their own: sending listings to a sales channel, AI listing
 * generation, and subscription renewals (which create orders). Reading, reviewing and manual record
 * keeping keep working while paused.
 */
export async function assertCommerceNotPaused(
  tenantPrisma: TenantPrismaService,
  businessId: string,
): Promise<void> {
  if (await commercePaused(tenantPrisma, businessId)) {
    throw new AppException(
      COMMERCE_PAUSED_CODE,
      'Commerce actions are paused for this business. Resume them from the Autonomous Commerce banner or Settings → Automations.',
      HttpStatus.LOCKED,
    );
  }
}
