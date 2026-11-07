import { ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { RequestWithUser } from '../tenancy/auth-context';
import { SecurityEventsService } from '../security/security-events.service';

/**
 * Rate-limits per business (falling back to IP for unauthenticated requests)
 * so one noisy tenant can't burn another tenant's budget on public/AI
 * endpoints (BE-013 / spec §1: "Rate limits per business on public + AI endpoints.").
 * Each rejection is also recorded as a `rate_limited` security event (Super Admin PRD §11.2).
 */
@Injectable()
export class BusinessThrottlerGuard extends ThrottlerGuard {
  @Optional()
  @Inject(SecurityEventsService)
  private readonly securityEvents?: SecurityEventsService;

  protected getTracker(req: RequestWithUser): Promise<string> {
    return Promise.resolve(req.user?.businessId ?? req.ip ?? 'unknown');
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    this.securityEvents?.emit({
      type: 'rate_limited',
      businessId: req.user?.businessId ?? null,
      userId: req.user?.sub ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
      metadata: {
        path: (req.originalUrl ?? req.url ?? '').split('?')[0],
        limit: detail.limit,
      },
    });
    return super.throwThrottlingException(context, detail);
  }
}
