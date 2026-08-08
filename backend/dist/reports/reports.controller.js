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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const generate_report_dto_1 = require("./dto/generate-report.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const reports_types_1 = require("./reports.types");
let ReportsController = class ReportsController {
    reports;
    constructor(reports) {
        this.reports = reports;
    }
    generate(user, kind, dto) {
        if (!(0, reports_types_1.isReportKind)(kind)) {
            throw new common_1.BadRequestException(`Unknown report kind: ${kind}`);
        }
        return this.reports.generate(kind, dto.month, user);
    }
    send(user, kind, dto) {
        if (!(0, reports_types_1.isReportKind)(kind)) {
            throw new common_1.BadRequestException(`Unknown report kind: ${kind}`);
        }
        return this.reports.send(kind, dto.month, user);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Post)(':kind'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, generate_report_dto_1.GenerateReportDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)(':kind/send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, generate_report_dto_1.GenerateReportDto]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "send", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map