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
exports.StaffController = void 0;
const common_1 = require("@nestjs/common");
const staff_service_1 = require("./staff.service");
const attendance_service_1 = require("./attendance.service");
const commissions_service_1 = require("./commissions.service");
const create_staff_dto_1 = require("./dto/create-staff.dto");
const update_staff_dto_1 = require("./dto/update-staff.dto");
const query_commissions_dto_1 = require("./dto/query-commissions.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let StaffController = class StaffController {
    staffService;
    attendanceService;
    commissionsService;
    constructor(staffService, attendanceService, commissionsService) {
        this.staffService = staffService;
        this.attendanceService = attendanceService;
        this.commissionsService = commissionsService;
    }
    list() {
        return this.staffService.list();
    }
    inbox() {
        return this.staffService.inbox();
    }
    create(user, dto) {
        return this.staffService.create(user.businessId, dto);
    }
    update(id, dto) {
        return this.staffService.update(id, dto);
    }
    remove(id) {
        return this.staffService.remove(id);
    }
    commissions(query) {
        return this.commissionsService.report(query.month);
    }
    toggleAttendance(user) {
        return this.attendanceService.toggle(user.businessId, user.sub);
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, common_1.Get)('staff'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('staff/inbox'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "inbox", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE),
    (0, common_1.Post)('staff'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_staff_dto_1.CreateStaffDto]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "create", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE),
    (0, common_1.Patch)('staff/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_staff_dto_1.UpdateStaffDto]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "update", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE),
    (0, common_1.Delete)('staff/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('staff/commissions'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_commissions_dto_1.QueryCommissionsDto]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "commissions", null);
__decorate([
    (0, common_1.Post)('attendance/toggle'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "toggleAttendance", null);
exports.StaffController = StaffController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [staff_service_1.StaffService,
        attendance_service_1.AttendanceService,
        commissions_service_1.CommissionsService])
], StaffController);
//# sourceMappingURL=staff.controller.js.map