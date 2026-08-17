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
var GmbInsightsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmbInsightsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const gmb_management_service_1 = require("./gmb-management.service");
const listings_constants_1 = require("./listings.constants");
const prisma_1 = require("../../generated/prisma");
let GmbInsightsProcessor = GmbInsightsProcessor_1 = class GmbInsightsProcessor extends bullmq_1.WorkerHost {
    prisma;
    gmbManagement;
    logger = new common_1.Logger(GmbInsightsProcessor_1.name);
    constructor(prisma, gmbManagement) {
        super();
        this.prisma = prisma;
        this.gmbManagement = gmbManagement;
    }
    async process() {
        const connectedGmb = await this.prisma.integration.findMany({
            where: {
                provider: prisma_1.IntegrationProvider.gmb,
                status: prisma_1.IntegrationStatus.connected,
            },
            select: { businessId: true },
        });
        for (const { businessId } of connectedGmb) {
            await this.gmbManagement
                .pullInsights(businessId)
                .catch((error) => this.logger.warn(`GMB insights pull failed for business ${businessId}: ${error.message}`));
        }
    }
};
exports.GmbInsightsProcessor = GmbInsightsProcessor;
exports.GmbInsightsProcessor = GmbInsightsProcessor = GmbInsightsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(listings_constants_1.GMB_INSIGHTS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        gmb_management_service_1.GmbManagementService])
], GmbInsightsProcessor);
//# sourceMappingURL=gmb-insights.processor.js.map