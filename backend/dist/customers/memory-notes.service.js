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
exports.MemoryNotesService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const memory_notes_constants_1 = require("./memory-notes.constants");
let MemoryNotesService = class MemoryNotesService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async create(dto) {
        await this.assertSubjectExists(dto.subjectType, dto.subjectId);
        const authorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        return this.tenantPrisma.client.memoryNote.create({
            data: {
                subjectType: dto.subjectType,
                subjectId: dto.subjectId,
                body: dto.body,
                pinned: dto.pinned ?? false,
                authorUserId,
            },
        });
    }
    list(subjectType, subjectId) {
        return this.tenantPrisma.client.memoryNote.findMany({
            where: { subjectType, subjectId },
            orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        });
    }
    async update(id, dto) {
        await this.findNote(id);
        return this.tenantPrisma.client.memoryNote.update({
            where: { id },
            data: dto,
        });
    }
    async remove(id) {
        await this.findNote(id);
        await this.tenantPrisma.client.memoryNote.delete({ where: { id } });
    }
    async findNote(id) {
        const note = await this.tenantPrisma.client.memoryNote.findUnique({
            where: { id },
        });
        if (!note) {
            throw new app_exception_1.AppException(memory_notes_constants_1.MEMORY_NOTE_ERROR_CODES.NOTE_NOT_FOUND, 'Memory note not found', common_1.HttpStatus.NOT_FOUND);
        }
        return note;
    }
    async assertSubjectExists(subjectType, subjectId) {
        const exists = await (() => {
            switch (subjectType) {
                case 'customer':
                    return this.tenantPrisma.client.customer.findUnique({
                        where: { id: subjectId },
                    });
                case 'supplier':
                    return this.tenantPrisma.client.supplier.findUnique({
                        where: { id: subjectId },
                    });
                case 'product':
                    return this.tenantPrisma.client.product.findUnique({
                        where: { id: subjectId },
                    });
                case 'table':
                    return this.tenantPrisma.client.table.findUnique({
                        where: { id: subjectId },
                    });
            }
        })();
        if (!exists) {
            throw new common_1.NotFoundException(`No ${subjectType} found with that id`);
        }
    }
};
exports.MemoryNotesService = MemoryNotesService;
exports.MemoryNotesService = MemoryNotesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], MemoryNotesService);
//# sourceMappingURL=memory-notes.service.js.map