import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from './integrations.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class IntegrationsController {
    private readonly integrations;
    private readonly config;
    constructor(integrations: IntegrationsService, config: ConfigService);
    list(user: AuthenticatedUser): Promise<{
        provider: import("../../generated/prisma").$Enums.IntegrationProvider;
        status: import("../../generated/prisma").$Enums.IntegrationStatus;
        updatedAt: Date | null;
    }[]>;
    connect(user: AuthenticatedUser, provider: string): Promise<import("./integrations.service").ConnectResult>;
    disconnect(user: AuthenticatedUser, provider: string): Promise<void>;
    callback(provider: string, code: string, state: string, res: Response): Promise<void>;
}
