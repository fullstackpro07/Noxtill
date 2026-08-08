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
exports.AppointmentsController = void 0;
const common_1 = require("@nestjs/common");
const appointments_service_1 = require("./appointments.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const query_appointments_dto_1 = require("./dto/query-appointments.dto");
const update_appointment_status_dto_1 = require("./dto/update-appointment-status.dto");
const reschedule_internal_appointment_dto_1 = require("./dto/reschedule-internal-appointment.dto");
const create_walk_in_appointment_dto_1 = require("./dto/create-walk-in-appointment.dto");
let AppointmentsController = class AppointmentsController {
    appointmentsService;
    constructor(appointmentsService) {
        this.appointmentsService = appointmentsService;
    }
    findAll(query) {
        return this.appointmentsService.findAll(query);
    }
    createWalkIn(user, dto) {
        return this.appointmentsService.createWalkIn(user.businessId, dto);
    }
    updateStatus(user, id, dto) {
        return this.appointmentsService.updateStatus(user.businessId, id, dto.status);
    }
    reschedule(user, id, dto) {
        return this.appointmentsService.reschedule(user.businessId, id, dto);
    }
};
exports.AppointmentsController = AppointmentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_appointments_dto_1.QueryAppointmentsDto]),
    __metadata("design:returntype", void 0)
], AppointmentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_walk_in_appointment_dto_1.CreateWalkInAppointmentDto]),
    __metadata("design:returntype", void 0)
], AppointmentsController.prototype, "createWalkIn", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_appointment_status_dto_1.UpdateAppointmentStatusDto]),
    __metadata("design:returntype", void 0)
], AppointmentsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/reschedule'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, reschedule_internal_appointment_dto_1.RescheduleInternalAppointmentDto]),
    __metadata("design:returntype", void 0)
], AppointmentsController.prototype, "reschedule", null);
exports.AppointmentsController = AppointmentsController = __decorate([
    (0, common_1.Controller)('appointments'),
    __metadata("design:paramtypes", [appointments_service_1.AppointmentsService])
], AppointmentsController);
//# sourceMappingURL=appointments.controller.js.map