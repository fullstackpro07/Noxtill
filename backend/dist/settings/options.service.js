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
exports.OptionsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const options_constants_1 = require("./options.constants");
const prisma_1 = require("../../generated/prisma");
let OptionsService = class OptionsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async createSet(businessId, dto) {
        try {
            return await this.tenantPrisma.client.optionSet.create({
                data: {
                    businessId,
                    setKey: dto.setKey,
                    label: dto.label,
                },
            });
        }
        catch (err) {
            if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                throw new app_exception_1.AppException(options_constants_1.OPTION_ERROR_CODES.DUPLICATE_SET_KEY, `An option set with key "${dto.setKey}" already exists`, common_1.HttpStatus.CONFLICT);
            }
            throw err;
        }
    }
    listAll() {
        return this.tenantPrisma.client.optionSet.findMany({
            orderBy: { createdAt: 'asc' },
            include: { options: { orderBy: { sortOrder: 'asc' } } },
        });
    }
    async addOption(setKey, dto) {
        const set = await this.findSet(setKey);
        const last = await this.tenantPrisma.client.option.findFirst({
            where: { optionSetId: set.id },
            orderBy: { sortOrder: 'desc' },
        });
        return this.tenantPrisma.client.option.create({
            data: {
                optionSetId: set.id,
                value: dto.value,
                sortOrder: (last?.sortOrder ?? -1) + 1,
            },
        });
    }
    async updateOption(setKey, optionId, dto) {
        await this.findOption(setKey, optionId);
        return this.tenantPrisma.client.option.update({
            where: { id: optionId },
            data: { value: dto.value, hidden: dto.hidden },
        });
    }
    async removeOption(setKey, optionId) {
        await this.findOption(setKey, optionId);
        await this.tenantPrisma.client.option.delete({ where: { id: optionId } });
    }
    async reorder(setKey, dto) {
        const set = await this.findSet(setKey);
        const options = await this.tenantPrisma.client.option.findMany({
            where: { optionSetId: set.id },
        });
        const realIds = new Set(options.map((o) => o.id));
        const orderedRealIds = dto.orderedIds.filter((id) => realIds.has(id));
        if (orderedRealIds.length !== options.length) {
            throw new app_exception_1.AppException(options_constants_1.OPTION_ERROR_CODES.OPTION_NOT_FOUND, 'orderedIds must include every real option in this set, exactly once', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.tenantPrisma.client.$transaction(orderedRealIds.map((id, index) => this.tenantPrisma.client.option.update({
            where: { id },
            data: { sortOrder: index },
        })));
        return this.tenantPrisma.client.option.findMany({
            where: { optionSetId: set.id },
            orderBy: { sortOrder: 'asc' },
        });
    }
    async findSet(setKey) {
        const set = await this.tenantPrisma.client.optionSet.findFirst({
            where: { setKey },
        });
        if (!set) {
            throw new common_1.NotFoundException(`Option set "${setKey}" not found`);
        }
        return set;
    }
    async findOption(setKey, optionId) {
        const set = await this.findSet(setKey);
        const option = await this.tenantPrisma.client.option.findUnique({
            where: { id: optionId },
        });
        if (!option || option.optionSetId !== set.id) {
            throw new common_1.NotFoundException('Option not found in this set');
        }
        return option;
    }
};
exports.OptionsService = OptionsService;
exports.OptionsService = OptionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], OptionsService);
//# sourceMappingURL=options.service.js.map