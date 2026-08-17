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
var SocialAccountsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAccountsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const social_connector_registry_1 = require("./connectors/social-connector-registry");
const token_cipher_service_1 = require("../integrations/token-cipher.service");
const signed_token_util_1 = require("../integrations/signed-token.util");
const social_constants_1 = require("./social.constants");
const prisma_1 = require("../../generated/prisma");
let SocialAccountsService = SocialAccountsService_1 = class SocialAccountsService {
    tenantPrisma;
    connectors;
    tokenCipher;
    config;
    logger = new common_1.Logger(SocialAccountsService_1.name);
    constructor(tenantPrisma, connectors, tokenCipher, config) {
        this.tenantPrisma = tenantPrisma;
        this.connectors = connectors;
        this.tokenCipher = tokenCipher;
        this.config = config;
    }
    async list(businessId) {
        const rows = await this.tenantPrisma.client.socialAccount.findMany({
            where: { businessId },
        });
        const byPlatform = new Map(rows.map((r) => [r.platform, r]));
        return this.connectors.all().map((platform) => {
            const row = byPlatform.get(platform);
            return {
                platform,
                status: row?.status ?? prisma_1.SocialAccountStatus.not_connected,
                externalAccountName: row?.externalAccountName ?? null,
                updatedAt: row?.updatedAt ?? null,
            };
        });
    }
    connect(businessId, platform) {
        const connector = this.connectors.get(platform);
        const state = (0, signed_token_util_1.signPayload)({ businessId, platform }, this.stateSecret());
        const url = connector.authUrl(state);
        return url ? { authUrl: url } : { requiresToken: true };
    }
    async connectWithToken(businessId, platform, token) {
        const connector = this.connectors.get(platform);
        if (connector.authUrl('probe') !== null) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.NOT_TOKEN_BASED, `${platform} uses OAuth — call connect() and complete the redirect instead`, common_1.HttpStatus.BAD_REQUEST);
        }
        let result;
        try {
            result = await connector.handleCallback(token);
        }
        catch (error) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.INVALID_CREDENTIAL, `Could not verify this ${platform} credential: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
        await this.tenantPrisma.client.socialAccount.upsert({
            where: { businessId_platform: { businessId, platform } },
            create: {
                businessId,
                platform,
                status: prisma_1.SocialAccountStatus.connected,
                tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
                externalAccountId: result.externalAccountId,
                externalAccountName: result.externalAccountName,
            },
            update: {
                status: prisma_1.SocialAccountStatus.connected,
                tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
                externalAccountId: result.externalAccountId,
                externalAccountName: result.externalAccountName,
            },
        });
        return { connected: true };
    }
    async handleCallback(platform, code, state) {
        const payload = (0, signed_token_util_1.verifyPayload)(state, this.stateSecret());
        if (!payload || payload.platform !== platform) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.INVALID_OAUTH_STATE, 'This connection request could not be verified — please try connecting again.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { businessId } = payload;
        const connector = this.connectors.get(platform);
        try {
            const result = await connector.handleCallback(code);
            await this.tenantPrisma.client.socialAccount.upsert({
                where: { businessId_platform: { businessId, platform } },
                create: {
                    businessId,
                    platform,
                    status: prisma_1.SocialAccountStatus.connected,
                    tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
                    externalAccountId: result.externalAccountId,
                    externalAccountName: result.externalAccountName,
                },
                update: {
                    status: prisma_1.SocialAccountStatus.connected,
                    tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
                    externalAccountId: result.externalAccountId,
                    externalAccountName: result.externalAccountName,
                },
            });
            return { businessId, ok: true };
        }
        catch (error) {
            this.logger.warn(`OAuth callback failed for platform=${platform}: ${error.message}`);
            await this.tenantPrisma.client.socialAccount.upsert({
                where: { businessId_platform: { businessId, platform } },
                create: {
                    businessId,
                    platform,
                    status: prisma_1.SocialAccountStatus.needs_attention,
                },
                update: { status: prisma_1.SocialAccountStatus.needs_attention },
            });
            return { businessId, ok: false };
        }
    }
    async disconnect(businessId, platform) {
        const connector = this.connectors.get(platform);
        await connector
            .disconnect()
            .catch((error) => this.logger.warn(`disconnect() failed for platform=${platform}: ${error.message}`));
        await this.tenantPrisma.client.socialAccount.updateMany({
            where: { businessId, platform },
            data: { status: prisma_1.SocialAccountStatus.not_connected, tokens: null },
        });
    }
    async getTokens(businessId, platform) {
        const row = await this.tenantPrisma.client.socialAccount.findUnique({
            where: { businessId_platform: { businessId, platform } },
        });
        if (!row?.tokens)
            return null;
        return JSON.parse(this.tokenCipher.decrypt(row.tokens));
    }
    async getAccount(businessId, platform) {
        return this.tenantPrisma.client.socialAccount.findUnique({
            where: { businessId_platform: { businessId, platform } },
        });
    }
    stateSecret() {
        return this.config.get('INTEGRATIONS_STATE_SECRET') ?? '';
    }
};
exports.SocialAccountsService = SocialAccountsService;
exports.SocialAccountsService = SocialAccountsService = SocialAccountsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        social_connector_registry_1.SocialConnectorRegistry,
        token_cipher_service_1.TokenCipherService,
        config_1.ConfigService])
], SocialAccountsService);
//# sourceMappingURL=social-accounts.service.js.map