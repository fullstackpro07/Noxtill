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
var IntegrationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const connector_registry_1 = require("./connector-registry");
const token_cipher_service_1 = require("./token-cipher.service");
const signed_token_util_1 = require("./signed-token.util");
const prisma_1 = require("../../generated/prisma");
let IntegrationsService = IntegrationsService_1 = class IntegrationsService {
    tenantPrisma;
    connectors;
    tokenCipher;
    config;
    logger = new common_1.Logger(IntegrationsService_1.name);
    constructor(tenantPrisma, connectors, tokenCipher, config) {
        this.tenantPrisma = tenantPrisma;
        this.connectors = connectors;
        this.tokenCipher = tokenCipher;
        this.config = config;
    }
    async list(businessId) {
        const rows = await this.tenantPrisma.client.integration.findMany({
            where: { businessId },
        });
        const byProvider = new Map(rows.map((r) => [r.provider, r]));
        return this.connectors.all().map((provider) => {
            const row = byProvider.get(provider);
            return {
                provider,
                status: row?.status ?? prisma_1.IntegrationStatus.not_connected,
                updatedAt: row?.updatedAt ?? null,
            };
        });
    }
    async connect(businessId, provider) {
        const connector = this.connectors.get(provider);
        const state = (0, signed_token_util_1.signPayload)({ businessId, provider }, this.stateSecret());
        const url = connector.authUrl(state);
        if (!url) {
            await this.tenantPrisma.client.integration.upsert({
                where: { businessId_provider: { businessId, provider } },
                create: { businessId, provider, status: prisma_1.IntegrationStatus.connected },
                update: { status: prisma_1.IntegrationStatus.connected },
            });
            return { connected: true };
        }
        return { authUrl: url };
    }
    async handleCallback(provider, code, state) {
        const payload = (0, signed_token_util_1.verifyPayload)(state, this.stateSecret());
        if (!payload || payload.provider !== provider) {
            throw new app_exception_1.AppException('INVALID_OAUTH_STATE', 'This connection request could not be verified — please try connecting again.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { businessId } = payload;
        const connector = this.connectors.get(provider);
        try {
            const tokens = await connector.handleCallback(code);
            await this.tenantPrisma.client.integration.upsert({
                where: { businessId_provider: { businessId, provider } },
                create: {
                    businessId,
                    provider,
                    status: prisma_1.IntegrationStatus.connected,
                    tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
                },
                update: {
                    status: prisma_1.IntegrationStatus.connected,
                    tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
                },
            });
            return { businessId, ok: true };
        }
        catch (error) {
            this.logger.warn(`OAuth callback failed for provider=${provider}: ${error.message}`);
            await this.tenantPrisma.client.integration.upsert({
                where: { businessId_provider: { businessId, provider } },
                create: { businessId, provider, status: prisma_1.IntegrationStatus.needs_attention },
                update: { status: prisma_1.IntegrationStatus.needs_attention },
            });
            return { businessId, ok: false };
        }
    }
    async disconnect(businessId, provider) {
        const connector = this.connectors.get(provider);
        await connector.disconnect().catch((error) => this.logger.warn(`disconnect() failed for provider=${provider}: ${error.message}`));
        await this.tenantPrisma.client.integration.updateMany({
            where: { businessId, provider },
            data: { status: prisma_1.IntegrationStatus.not_connected, tokens: null },
        });
    }
    async getTokens(businessId, provider) {
        const row = await this.tenantPrisma.client.integration.findUnique({
            where: { businessId_provider: { businessId, provider } },
        });
        if (!row?.tokens)
            return null;
        return JSON.parse(this.tokenCipher.decrypt(row.tokens));
    }
    stateSecret() {
        return this.config.get('INTEGRATIONS_STATE_SECRET') ?? '';
    }
};
exports.IntegrationsService = IntegrationsService;
exports.IntegrationsService = IntegrationsService = IntegrationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        connector_registry_1.ConnectorRegistry,
        token_cipher_service_1.TokenCipherService,
        config_1.ConfigService])
], IntegrationsService);
//# sourceMappingURL=integrations.service.js.map