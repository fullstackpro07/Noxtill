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
var WebhookIdempotencyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookIdempotencyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_1 = require("../../../generated/prisma");
const prisma_service_1 = require("../../prisma/prisma.service");
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
let WebhookIdempotencyService = WebhookIdempotencyService_1 = class WebhookIdempotencyService {
    prisma;
    logger = new common_1.Logger(WebhookIdempotencyService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async claim(provider, eventId) {
        try {
            await this.prisma.webhookEvent.create({ data: { provider, eventId } });
            return true;
        }
        catch (error) {
            if (error instanceof prisma_1.Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_CONSTRAINT_VIOLATION) {
                return false;
            }
            throw error;
        }
    }
    async handle(provider, eventId, enqueue) {
        const isNew = await this.claim(provider, eventId);
        if (!isNew) {
            this.logger.debug(`Duplicate webhook event ignored: ${provider}/${eventId}`);
            return { duplicate: true };
        }
        await enqueue();
        return { duplicate: false };
    }
};
exports.WebhookIdempotencyService = WebhookIdempotencyService;
exports.WebhookIdempotencyService = WebhookIdempotencyService = WebhookIdempotencyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WebhookIdempotencyService);
//# sourceMappingURL=webhook-idempotency.service.js.map