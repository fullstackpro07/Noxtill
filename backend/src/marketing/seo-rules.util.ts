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

export const SEO_AI_NOT_CONFIGURED = 'SEO_AI_NOT_CONFIGURED';
export const SEO_AI_FAILED = 'SEO_AI_FAILED';

/**
 * Calls the AI provider and turns infrastructure failures into clear messages: a missing provider key
 * says so (instead of a generic 500), and any other provider failure says the draft wasn't created.
 */
export async function seoAiComplete(
  ai: {
    complete(
      businessId: string,
      prompt: string,
      temperature: number,
      kind: 'complete',
    ): Promise<string>;
  },
  businessId: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  try {
    return await ai.complete(businessId, prompt, temperature, 'complete');
  } catch (error) {
    if (error instanceof AppException) throw error;
    if (
      error instanceof Error &&
      error.message === 'ANTHROPIC_API_KEY is not configured'
    ) {
      throw new AppException(
        SEO_AI_NOT_CONFIGURED,
        'AI drafting is not set up on this server (no AI provider key is configured). Write the content yourself, or ask your administrator to configure the AI provider.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new AppException(
      SEO_AI_FAILED,
      'The AI provider did not respond, so no draft was created. Try again in a moment.',
      HttpStatus.BAD_GATEWAY,
    );
  }
}
