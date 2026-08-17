import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { MasterListingService } from './master-listing.service';
export interface SyncResult {
    provider: string;
    status: 'success' | 'failed';
    message?: string;
}
export declare class ListingSyncService {
    private readonly tenantPrisma;
    private readonly integrations;
    private readonly connectors;
    private readonly masterListing;
    constructor(tenantPrisma: TenantPrismaService, integrations: IntegrationsService, connectors: ConnectorRegistry, masterListing: MasterListingService);
    sync(businessId: string): Promise<SyncResult[]>;
    listSyncLog(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        message: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        status: string;
        provider: import("../../generated/prisma").$Enums.IntegrationProvider;
    }[]>;
    citationAudit(businessId: string): Promise<{
        provider: import("../../generated/prisma").$Enums.IntegrationProvider;
        syncedAt: Date;
        matches: boolean;
        mismatchedFields: string[];
    }[]>;
    health(businessId: string): Promise<{
        score: number;
        totalProviders: number;
        connectedProviders: import("../../generated/prisma").$Enums.IntegrationProvider[];
        hasRecentSync: boolean;
        mismatchCount: number;
    }>;
    private diffFields;
}
