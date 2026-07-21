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
exports.PublicAppointmentController = void 0;
const common_1 = require("@nestjs/common");
const public_booking_service_1 = require("./public-booking.service");
const reschedule_appointment_dto_1 = require("./dto/reschedule-appointment.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
let PublicAppointmentController = class PublicAppointmentController {
    publicBookingService;
    constructor(publicBookingService) {
        this.publicBookingService = publicBookingService;
    }
    reschedule(token, dto) {
        return this.publicBookingService.reschedule(token, dto.startsAt);
    }
    cancel(token) {
        return this.publicBookingService.cancel(token);
    }
};
exports.PublicAppointmentController = PublicAppointmentController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':token/reschedule'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reschedule_appointment_dto_1.RescheduleAppointmentDto]),
    __metadata("design:returntype", void 0)
], PublicAppointmentController.prototype, "reschedule", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':token/cancel'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicAppointmentController.prototype, "cancel", null);
exports.PublicAppointmentController = PublicAppointmentController = __decorate([
    (0, common_1.Controller)('public/appt'),
    __metadata("design:paramtypes", [public_booking_service_1.PublicBookingService])
], PublicAppointmentController);
//# sourceMappingURL=public-appointment.controller.js.map