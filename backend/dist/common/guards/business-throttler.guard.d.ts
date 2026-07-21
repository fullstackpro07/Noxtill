import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../tenancy/auth-context';
export declare class BusinessThrottlerGuard extends ThrottlerGuard {
    protected getTracker(req: RequestWithUser): Promise<string>;
}
