import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export const SEO_AI_DRAFTS_OFF = 'SEO_AI_DRAFTS_OFF';

export interface SeoRules {
  aiDraftsEnabled: boolean;
  improveBelowRank: number;
  refreshDropPositions: number;
}

/** SEO Autopilot rules from Settings → SEO Autopilot (`Business.policies`), with their defaults. */
export async function seoRules(
  tenantPrisma: TenantPrismaService,
  businessId: string,
): Promise<SeoRules> {
  const business = await tenantPrisma.client.business.findUnique({
    where: { id: businessId },
    select: { policies: true },
  });
  const policies = resolvePolicies(business);
  return {
    aiDraftsEnabled: policies.bool('seo.aiDraftsEnabled'),
    improveBelowRank: policies.num('seo.improveBelowRank') ?? 10,
    refreshDropPositions: policies.num('seo.refreshDropPositions') ?? 5,
  };
}

/** Autopilot level L0 (observe only): AI may not draft anything. */
export async function assertSeoAiDraftsAllowed(
  tenantPrisma: TenantPrismaService,
  businessId: string,
): Promise<void> {
  if (!(await seoRules(tenantPrisma, businessId)).aiDraftsEnabled) {
    throw new AppException(
      SEO_AI_DRAFTS_OFF,
      'AI drafts are turned off in Settings → SEO Autopilot. Write the proposal yourself or turn AI drafts on.',
      HttpStatus.CONFLICT,
    );
  }
}
