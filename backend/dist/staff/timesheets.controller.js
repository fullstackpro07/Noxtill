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
exports.TimesheetsController = void 0;
const common_1 = require("@nestjs/common");
const timesheets_service_1 = require("./timesheets.service");
const query_timesheets_dto_1 = require("./dto/query-timesheets.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let TimesheetsController = class TimesheetsController {
    timesheets;
    constructor(timesheets) {
        this.timesheets = timesheets;
    }
    report(user, query) {
        return this.timesheets.report(user.businessId, query.month);
    }
    approve(user, staffUserId, query) {
        return this.timesheets.approve(user.businessId, staffUserId, query.month, user.sub);
    }
};
exports.TimesheetsController = TimesheetsController;
__decorate([
    (0, common_1.Get)('timesheets'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, query_timesheets_dto_1.QueryTimesheetsDto]),
    __metadata("design:returntype", void 0)
], TimesheetsController.prototype, "report", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STAFF_MANAGE_SCHEDULE),
    (0, common_1.Post)('timesheets/:staffUserId/approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('staffUserId')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, query_timesheets_dto_1.QueryTimesheetsDto]),
    __metadata("design:returntype", void 0)
], TimesheetsController.prototype, "approve", null);
exports.TimesheetsController = TimesheetsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [timesheets_service_1.TimesheetsService])
], TimesheetsController);
//# sourceMappingURL=timesheets.controller.js.map