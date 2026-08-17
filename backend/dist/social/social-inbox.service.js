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
exports.SocialInboxService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const social_accounts_service_1 = require("./social-accounts.service");
const social_connector_registry_1 = require("./connectors/social-connector-registry");
const social_constants_1 = require("./social.constants");
const prisma_1 = require("../../generated/prisma");
let SocialInboxService = class SocialInboxService {
    tenantPrisma;
    prisma;
    accounts;
    connectors;
    constructor(tenantPrisma, prisma, accounts, connectors) {
        this.tenantPrisma = tenantPrisma;
        this.prisma = prisma;
        this.accounts = accounts;
        this.connectors = connectors;
    }
    list(businessId, status) {
        return this.tenantPrisma.client.socialInboxItem.findMany({
            where: { businessId, ...(status ? { status } : {}) },
            orderBy: { receivedAt: 'desc' },
        });
    }
    async ingest(platform, externalAccountId, item) {
        const account = await this.prisma.socialAccount.findFirst({
            where: {
                platform,
                externalAccountId,
                status: prisma_1.SocialAccountStatus.connected,
            },
        });
        if (!account)
            return;
        await this.prisma.socialInboxItem.upsert({
            where: {
                businessId_platform_externalId: {
                    businessId: account.businessId,
                    platform,
                    externalId: item.externalId,
                },
            },
            create: {
                businessId: account.businessId,
                platform,
                externalId: item.externalId,
                kind: item.kind,
                authorName: item.authorName,
                text: item.text,
                postExternalId: item.postExternalId,
                receivedAt: new Date(item.receivedAt),
            },
            update: {},
        });
    }
    async reply(businessId, id, text) {
        const item = await this.find(businessId, id);
        const tokens = await this.accounts.getTokens(businessId, item.platform);
        if (!tokens) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.ACCOUNT_NOT_CONNECTED, `${item.platform} is not connected for this business`, common_1.HttpStatus.BAD_REQUEST);
        }
        const connector = this.connectors.get(item.platform);
        await connector.replyToInboxItem(tokens, {
            externalId: item.externalId,
            postExternalId: item.postExternalId ?? undefined,
        }, text);
        return this.tenantPrisma.client.socialInboxItem.update({
            where: { id },
            data: {
                status: prisma_1.SocialInboxStatus.replied,
                repliedText: text,
                repliedAt: new Date(),
            },
        });
    }
    async markRead(businessId, id) {
        await this.find(businessId, id);
        return this.tenantPrisma.client.socialInboxItem.update({
            where: { id },
            data: { status: prisma_1.SocialInboxStatus.read },
        });
    }
    async find(businessId, id) {
        const item = await this.tenantPrisma.client.socialInboxItem.findUnique({
            where: { id },
        });
        if (!item || item.businessId !== businessId) {
            throw new common_1.NotFoundException('Inbox item not found');
        }
        return item;
    }
};
exports.SocialInboxService = SocialInboxService;
exports.SocialInboxService = SocialInboxService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        prisma_service_1.PrismaService,
        social_accounts_service_1.SocialAccountsService,
        social_connector_registry_1.SocialConnectorRegistry])
], SocialInboxService);
//# sourceMappingURL=social-inbox.service.js.map