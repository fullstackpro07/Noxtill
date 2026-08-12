import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ActivityService } from './activity.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ActivityController {
    private readonly activityService;
    constructor(activityService: ActivityService);
    stream(user: AuthenticatedUser): Observable<MessageEvent>;
}
