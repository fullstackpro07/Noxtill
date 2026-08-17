"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffModule = void 0;
const common_1 = require("@nestjs/common");
const staff_service_1 = require("./staff.service");
const attendance_service_1 = require("./attendance.service");
const commissions_service_1 = require("./commissions.service");
const staff_controller_1 = require("./staff.controller");
const shifts_service_1 = require("./shifts.service");
const shifts_controller_1 = require("./shifts.controller");
const time_off_service_1 = require("./time-off.service");
const time_off_controller_1 = require("./time-off.controller");
const timesheets_service_1 = require("./timesheets.service");
const timesheets_controller_1 = require("./timesheets.controller");
const advances_service_1 = require("./advances.service");
const advances_controller_1 = require("./advances.controller");
const payroll_service_1 = require("./payroll.service");
const payroll_controller_1 = require("./payroll.controller");
let StaffModule = class StaffModule {
};
exports.StaffModule = StaffModule;
exports.StaffModule = StaffModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            staff_controller_1.StaffController,
            shifts_controller_1.ShiftsController,
            time_off_controller_1.TimeOffController,
            timesheets_controller_1.TimesheetsController,
            advances_controller_1.AdvancesController,
            payroll_controller_1.PayrollController,
        ],
        providers: [
            staff_service_1.StaffService,
            attendance_service_1.AttendanceService,
            commissions_service_1.CommissionsService,
            shifts_service_1.ShiftsService,
            time_off_service_1.TimeOffService,
            timesheets_service_1.TimesheetsService,
            advances_service_1.AdvancesService,
            payroll_service_1.PayrollService,
        ],
        exports: [staff_service_1.StaffService, commissions_service_1.CommissionsService],
    })
], StaffModule);
//# sourceMappingURL=staff.module.js.map