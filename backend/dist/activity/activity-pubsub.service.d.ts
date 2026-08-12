import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
export declare class ActivityPubSubService implements OnModuleDestroy {
    private readonly logger;
    private readonly publisher;
    constructor(config: ConfigService);
    publish(channel: string, payload: unknown): Promise<void>;
    subscribe<T = unknown>(channel: string): Observable<T>;
    onModuleDestroy(): void;
}
