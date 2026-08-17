"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListingSyncService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const integrations_service_1 = require("../integrations/integrations.service");
const connector_registry_1 = require("../integrations/connector-registry");
const master_listing_service_1 = require("./master-listing.service");
const listings_constants_1 = require("./listings.constants");
const prisma_1 = require("../../generated/prisma");
const RECENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NAP_FIELDS = [
    'name',
    'phone',
    'website',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'postalCode',
    'country',
];
let ListingSyncService = class ListingSyncService {
    tenantPrisma;
    integrations;
    connectors;
    masterListing;
    constructor(tenantPrisma, integrations, connectors, masterListing) {
        this.tenantPrisma = tenantPrisma;
        this.integrations = integrations;
        this.connectors = connectors;
        this.masterListing = masterListing;
    }
    async sync(businessId) {
        const listing = await this.masterListing.find(businessId);
        if (!listing) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.MASTER_LISTING_NOT_SET, 'Set the Master Business Record before syncing to directories', common_1.HttpStatus.BAD_REQUEST);
        }
        const data = this.masterListing.toConnectorData(listing);
        const results = [];
        for (const provider of this.connectors.directoryProviders()) {
            const integration = await this.tenantPrisma.client.integration.findUnique({
                where: { businessId_provider: { businessId, provider } },
            });
            if (!integration || integration.status !== prisma_1.IntegrationStatus.connected) {
                continue;
            }
            const tokens = await this.integrations.getTokens(businessId, provider);
            const connector = this.connectors.get(provider);
            if (!tokens || !connector.pushListing)
                continue;
            try {
                await connector.pushListing(tokens, data, integration.meta);
                await this.tenantPrisma.client.listingSyncLog.create({
                    data: { businessId, provider, status: 'success' },
                });
                await this.tenantPrisma.client.citation.upsert({
                    where: { businessId_provider: { businessId, provider } },
                    create: {
                        businessId,
                        provider,
                        snapshot: data,
                        syncedAt: new Date(),
                    },
                    update: {
                        snapshot: data,
                        syncedAt: new Date(),
                    },
                });
                results.push({ provider, status: 'success' });
            }
            catch (error) {
                const message = error.message;
                await this.tenantPrisma.client.listingSyncLog.create({
                    data: { businessId, provider, status: 'failed', message },
                });
                results.push({ provider, status: 'failed', message });
            }
        }
        return results;
    }
    listSyncLog(businessId) {
        return this.tenantPrisma.client.listingSyncLog.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async citationAudit(businessId) {
        const listing = await this.masterListing.find(businessId);
        const citations = await this.tenantPrisma.client.citation.findMany({
            where: { businessId },
        });
        return citations.map((citation) => {
            const snapshot = citation.snapshot;
            const mismatchedFields = listing
                ? this.diffFields(snapshot, listing)
                : NAP_FIELDS.slice();
            return {
                provider: citation.provider,
                syncedAt: citation.syncedAt,
                matches: mismatchedFields.length === 0,
                mismatchedFields,
            };
        });
    }
    async health(businessId) {
        const directoryProviders = this.connectors.directoryProviders();
        const integrations = await this.tenantPrisma.client.integration.findMany({
            where: { businessId, provider: { in: directoryProviders } },
        });
        const connected = integrations.filter((integration) => integration.status === prisma_1.IntegrationStatus.connected);
        const recentSync = await this.tenantPrisma.client.listingSyncLog.findFirst({
            where: {
                businessId,
                status: 'success',
                createdAt: { gte: new Date(Date.now() - RECENT_SYNC_WINDOW_MS) },
            },
        });
        const citationAudit = await this.citationAudit(businessId);
        const mismatchCount = citationAudit.filter((c) => !c.matches).length;
        const connectivityScore = directoryProviders.length === 0
            ? 0
            : Math.round((connected.length / directoryProviders.length) * 100);
        const recencyPenalty = recentSync ? 0 : 20;
        const mismatchPenalty = Math.min(mismatchCount * 10, 30);
        const score = Math.max(0, connectivityScore - recencyPenalty - mismatchPenalty);
        return {
            score,
            totalProviders: directoryProviders.length,
            connectedProviders: connected.map((integration) => integration.provider),
            hasRecentSync: Boolean(recentSync),
            mismatchCount,
        };
    }
    diffFields(snapshot, current) {
        return NAP_FIELDS.filter((field) => (snapshot[field] ?? null) !== (current[field] ?? null));
    }
};
exports.ListingSyncService = ListingSyncService;
exports.ListingSyncService = ListingSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        integrations_service_1.IntegrationsService,
        connector_registry_1.ConnectorRegistry,
        master_listing_service_1.MasterListingService])
], ListingSyncService);
//# sourceMappingURL=listing-sync.service.js.map