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
exports.TerminologyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const terminology_constants_1 = require("./terminology.constants");
let TerminologyService = class TerminologyService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAll(businessId) {
        const overrides = await this.prisma.labelOverride.findMany({
            where: { businessId },
        });
        const result = {};
        for (const [area, terms] of Object.entries(terminology_constants_1.DEFAULT_TERMS)) {
            result[area] = { ...terms };
        }
        for (const override of overrides) {
            result[override.area] = result[override.area] ?? {};
            result[override.area][override.key] = override.value;
        }
        return result;
    }
    async getArea(businessId, area) {
        const all = await this.getAll(businessId);
        return all[area] ?? {};
    }
    async setMany(businessId, updates) {
        if (updates.length === 0)
            return this.getAll(businessId);
        await this.prisma.$transaction(updates.map((u) => this.prisma.labelOverride.upsert({
            where: {
                businessId_area_key: { businessId, area: u.area, key: u.key },
            },
            create: { businessId, area: u.area, key: u.key, value: u.value },
            update: { value: u.value },
        })));
        return this.getAll(businessId);
    }
    async applyToText(businessId, text) {
        if (!text.includes('{{term:'))
            return text;
        const resolved = await this.getAll(businessId);
        return text.replace(terminology_constants_1.TERM_PATTERN, (_match, area, key) => {
            const resolvedArea = area ?? 'general';
            return resolved[resolvedArea]?.[key] ?? key;
        });
    }
};
exports.TerminologyService = TerminologyService;
exports.TerminologyService = TerminologyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TerminologyService);
//# sourceMappingURL=terminology.service.js.map