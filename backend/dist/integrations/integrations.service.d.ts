import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from './connector-registry';
import { TokenCipherService } from './token-cipher.service';
import { OAuthTokens } from './connector.interface';
import { IntegrationProvider } from '../../generated/prisma';
export interface ConnectResult {
    authUrl?: string;
    connected?: true;
}
export declare class IntegrationsService {
    private readonly tenantPrisma;
    private readonly connectors;
    private readonly tokenCipher;
    private readonly config;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, connectors: ConnectorRegistry, tokenCipher: TokenCipherService, config: ConfigService);
    list(businessId: string): Promise<{
        provider: import("../../generated/prisma").$Enums.IntegrationProvider;
        status: import("../../generated/prisma").$Enums.IntegrationStatus;
        updatedAt: Date | null;
    }[]>;
    connect(businessId: string, provider: IntegrationProvider): Promise<ConnectResult>;
    handleCallback(provider: IntegrationProvider, code: string, state: string): Promise<{
        businessId: string;
        ok: boolean;
    }>;
    disconnect(businessId: string, provider: IntegrationProvider): Promise<void>;
    getTokens(businessId: string, provider: IntegrationProvider): Promise<OAuthTokens | null>;
    private stateSecret;
}
