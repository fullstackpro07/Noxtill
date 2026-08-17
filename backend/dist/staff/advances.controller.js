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
exports.AdvancesController = void 0;
const common_1 = require("@nestjs/common");
const advances_service_1 = require("./advances.service");
const create_advance_dto_1 = require("./dto/create-advance.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let AdvancesController = class AdvancesController {
    advances;
    constructor(advances) {
        this.advances = advances;
    }
    create(user, staffUserId, dto) {
        return this.advances.create(user.businessId, staffUserId, dto);
    }
    list(staffUserId) {
        return this.advances.list(staffUserId);
    }
    update(advanceId, dto) {
        return this.advances.update(advanceId, dto);
    }
    cancel(advanceId) {
        return this.advances.cancel(advanceId);
    }
};
exports.AdvancesController = AdvancesController;
__decorate([
    (0, common_1.Post)('staff/:id/advances'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_advance_dto_1.CreateAdvanceDto]),
    __metadata("design:returntype", void 0)
], AdvancesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('staff/:id/advances'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdvancesController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('staff/:id/advances/:advanceId'),
    __param(0, (0, common_1.Param)('advanceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_advance_dto_1.UpdateAdvanceDto]),
    __metadata("design:returntype", void 0)
], AdvancesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('staff/:id/advances/:advanceId'),
    __param(0, (0, common_1.Param)('advanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdvancesController.prototype, "cancel", null);
exports.AdvancesController = AdvancesController = __decorate([
    (0, common_1.Controller)(),
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE_SCHEDULE),
    __metadata("design:paramtypes", [advances_service_1.AdvancesService])
], AdvancesController);
//# sourceMappingURL=advances.controller.js.map