import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { RequestWithUser } from '../common/tenancy/auth-context';
import { AppException } from '../common/filters/app.exception';
import { EntitlementsService } from './entitlements.service';
import { USAGE_ERROR_CODES } from './usage.constants';

const CACHE_MS = 30_000;

/**
 * Read and export only for a suspended workspace (spec §13.4 day 15, §15.2 trial ended without a
 * card): every write is refused with a clear reason, except the paths a customer needs to get
 * back in good standing or take their data out. Reads always work, and nothing is ever deleted.
 * Fails OPEN on any lookup error (spec §16: never lock a customer out of software because the
 * metering service had a problem — metered work is gated separately and fails closed).
 */
@Injectable()
export class SubscriptionStateGuard implements CanActivate {
  private readonly cache = new Map<
    string,
    { at: number; suspended: boolean; status: string }
  >();
  private static readonly ALLOW = [
    /^\/api\/v1\/(auth|billing|subscription|usage|plans|webhooks|exports|gdpr|account|notifications|notification-preferences|settings\/hub\/(preferences|rows\/[^/]+\/[^/]+\/opened))(\/|$|\?)/,
  ];

  constructor(
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.entitlements || context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user?.businessId) return true;
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const path = req.originalUrl ?? req.url ?? '';
    if (SubscriptionStateGuard.ALLOW.some((re) => re.test(path))) return true;

    let state = this.cache.get(req.user.businessId);
    if (!state || Date.now() - state.at > CACHE_MS) {
      try {
        const rootId = await this.entitlements.rootId(req.user.businessId);
        const sub = await this.entitlements.ensureSubscription(rootId);
        state = {
          at: Date.now(),
          suspended: this.entitlements.statusFlags(sub).suspended,
          status: sub.status,
        };
        this.cache.set(req.user.businessId, state);
      } catch {
        return true;
      }
    }
    if (!state.suspended) return true;
    throw new AppException(
      USAGE_ERROR_CODES.SUBSCRIPTION_PAUSED,
      state.status === 'past_due'
        ? 'Your subscription payment is overdue, so this workspace is read-only. You can still view and export everything. Update your payment method to continue.'
        : 'This workspace is read-only because the subscription is not active. You can still view and export everything — nothing has been deleted. Choose a plan to continue.',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
