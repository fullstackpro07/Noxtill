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
exports.CustomerImportController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const customer_import_service_1 = require("./customer-import.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let CustomerImportController = class CustomerImportController {
    importService;
    constructor(importService) {
        this.importService = importService;
    }
    stage(user, file) {
        if (!file) {
            throw new common_1.BadRequestException('file is required');
        }
        return this.importService.stageImport(user.businessId, file);
    }
    getBatch(batchId) {
        return this.importService.getBatch(batchId);
    }
    confirm(user, batchId) {
        return this.importService.confirm(user.businessId, batchId);
    }
};
exports.CustomerImportController = CustomerImportController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CustomerImportController.prototype, "stage", null);
__decorate([
    (0, common_1.Get)(':batch'),
    __param(0, (0, common_1.Param)('batch')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CustomerImportController.prototype, "getBatch", null);
__decorate([
    (0, common_1.Post)(':batch/confirm'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('batch')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CustomerImportController.prototype, "confirm", null);
exports.CustomerImportController = CustomerImportController = __decorate([
    (0, common_1.Controller)('customers/import'),
    __metadata("design:paramtypes", [customer_import_service_1.CustomerImportService])
], CustomerImportController);
//# sourceMappingURL=customer-import.controller.js.map