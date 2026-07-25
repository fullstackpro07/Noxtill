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
var PlansSeedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansSeedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const billing_constants_1 = require("./billing.constants");
let PlansSeedService = PlansSeedService_1 = class PlansSeedService {
    prisma;
    logger = new common_1.Logger(PlansSeedService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        try {
            for (const plan of billing_constants_1.DEFAULT_PLANS) {
                await this.prisma.plan.upsert({
                    where: { key: plan.key },
                    create: plan,
                    update: {
                        name: plan.name,
                        price: plan.price,
                        msgQuota: plan.msgQuota,
                        userLimit: plan.userLimit,
                    },
                });
            }
        }
        catch (error) {
            this.logger.error(`Failed to seed plans: ${error.message}`);
        }
    }
};
exports.PlansSeedService = PlansSeedService;
exports.PlansSeedService = PlansSeedService = PlansSeedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PlansSeedService);
//# sourceMappingURL=plans-seed.service.js.map