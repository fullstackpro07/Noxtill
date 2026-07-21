import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../tenancy/auth-context';

/**
 * Rate-limits per business (falling back to IP for unauthenticated requests)
 * so one noisy tenant can't burn another tenant's budget on public/AI
 * endpoints (BE-013 / spec §1: "Rate limits per business on public + AI endpoints.").
 */
@Injectable()
export class BusinessThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: RequestWithUser): Promise<string> {
    return Promise.resolve(req.user?.businessId ?? req.ip ?? 'unknown');
  }
}
