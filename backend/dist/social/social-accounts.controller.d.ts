import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SocialAccountsService } from './social-accounts.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
declare class ConnectWithTokenDto {
    token: string;
}
export declare class SocialAccountsController {
    private readonly accounts;
    private readonly config;
    constructor(accounts: SocialAccountsService, config: ConfigService);
    list(user: AuthenticatedUser): Promise<{
        platform: import("generated/prisma").$Enums.SocialPlatform;
        status: import("generated/prisma").$Enums.SocialAccountStatus;
        externalAccountName: string | null;
        updatedAt: Date | null;
    }[]>;
    connect(user: AuthenticatedUser, platform: string): import("./social-accounts.service").SocialConnectResult;
    connectWithToken(user: AuthenticatedUser, platform: string, dto: ConnectWithTokenDto): Promise<{
        connected: true;
    }>;
    disconnect(user: AuthenticatedUser, platform: string): Promise<void>;
    callback(platform: string, code: string, state: string, res: Response): Promise<void>;
}
export {};
