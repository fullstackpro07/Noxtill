import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { TokenCipherService } from '../integrations/token-cipher.service';
import { SocialOAuthTokens } from './connectors/social-connector.interface';
import { SocialPlatform } from '../../generated/prisma';
export interface SocialConnectResult {
    authUrl?: string;
    requiresToken?: true;
}
export declare class SocialAccountsService {
    private readonly tenantPrisma;
    private readonly connectors;
    private readonly tokenCipher;
    private readonly config;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, connectors: SocialConnectorRegistry, tokenCipher: TokenCipherService, config: ConfigService);
    list(businessId: string): Promise<{
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        status: import("../../generated/prisma").$Enums.SocialAccountStatus;
        externalAccountName: string | null;
        updatedAt: Date | null;
    }[]>;
    connect(businessId: string, platform: SocialPlatform): SocialConnectResult;
    connectWithToken(businessId: string, platform: SocialPlatform, token: string): Promise<{
        connected: true;
    }>;
    handleCallback(platform: SocialPlatform, code: string, state: string): Promise<{
        businessId: string;
        ok: boolean;
    }>;
    disconnect(businessId: string, platform: SocialPlatform): Promise<void>;
    getTokens(businessId: string, platform: SocialPlatform): Promise<SocialOAuthTokens | null>;
    getAccount(businessId: string, platform: SocialPlatform): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        meta: import("generated/prisma/runtime/library").JsonValue;
        status: import("../../generated/prisma").$Enums.SocialAccountStatus;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        tokens: string | null;
        externalAccountId: string | null;
        externalAccountName: string | null;
    } | null>;
    private stateSecret;
}
