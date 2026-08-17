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
exports.TimeOffController = void 0;
const common_1 = require("@nestjs/common");
const time_off_service_1 = require("./time-off.service");
const create_time_off_dto_1 = require("./dto/create-time-off.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let TimeOffController = class TimeOffController {
    timeOff;
    constructor(timeOff) {
        this.timeOff = timeOff;
    }
    create(user, dto) {
        return this.timeOff.create(user.businessId, dto);
    }
    list(staffUserId) {
        return this.timeOff.list(staffUserId);
    }
    approve(id) {
        return this.timeOff.approve(id);
    }
    reject(id) {
        return this.timeOff.reject(id);
    }
};
exports.TimeOffController = TimeOffController;
__decorate([
    (0, common_1.Post)('time-off'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_time_off_dto_1.CreateTimeOffDto]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('time-off'),
    __param(0, (0, common_1.Query)('staffUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "list", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE_SCHEDULE),
    (0, common_1.Patch)('time-off/:id/approve'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "approve", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE_SCHEDULE),
    (0, common_1.Patch)('time-off/:id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "reject", null);
exports.TimeOffController = TimeOffController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [time_off_service_1.TimeOffService])
], TimeOffController);
//# sourceMappingURL=time-off.controller.js.map