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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionCenterController = void 0;
const common_1 = require("@nestjs/common");
const action_center_service_1 = require("./action-center.service");
const snooze_action_item_dto_1 = require("./dto/snooze-action-item.dto");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const prisma_1 = require("../../generated/prisma");
let ActionCenterController = class ActionCenterController {
    actionCenterService;
    tenantPrisma;
    constructor(actionCenterService, tenantPrisma) {
        this.actionCenterService = actionCenterService;
        this.tenantPrisma = tenantPrisma;
    }
    async list(user, priority, type) {
        const businessUserId = await this.resolveBusinessUserId(user);
        return this.actionCenterService.list(user.businessId, user.role, businessUserId, {
            priority,
            type,
        });
    }
    complete(user, id) {
        return this.actionCenterService.complete(user.businessId, id);
    }
    dismiss(user, id) {
        return this.actionCenterService.dismiss(user.businessId, id);
    }
    snooze(user, id, dto) {
        return this.actionCenterService.snooze(user.businessId, id, dto);
    }
    async resolveBusinessUserId(user) {
        if (user.role !== prisma_1.Role.staff)
            return null;
        const businessUser = await this.tenantPrisma.client.businessUser.findUnique({
            where: {
                businessId_userId: { businessId: user.businessId, userId: user.sub },
            },
            select: { id: true },
        });
        return businessUser?.id ?? null;
    }
};
exports.ActionCenterController = ActionCenterController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('priority')),
    __param(2, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ActionCenterController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/complete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ActionCenterController.prototype, "complete", null);
__decorate([
    (0, common_1.Post)(':id/dismiss'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ActionCenterController.prototype, "dismiss", null);
__decorate([
    (0, common_1.Post)(':id/snooze'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, snooze_action_item_dto_1.SnoozeActionItemDto]),
    __metadata("design:returntype", void 0)
], ActionCenterController.prototype, "snooze", null);
exports.ActionCenterController = ActionCenterController = __decorate([
    (0, common_1.Controller)('actions'),
    __metadata("design:paramtypes", [action_center_service_1.ActionCenterService,
        tenant_prisma_service_1.TenantPrismaService])
], ActionCenterController);
//# sourceMappingURL=action-center.controller.js.map