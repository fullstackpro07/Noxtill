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
exports.TerminologyController = void 0;
const common_1 = require("@nestjs/common");
const terminology_service_1 = require("./terminology.service");
const set_labels_dto_1 = require("./dto/set-labels.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let TerminologyController = class TerminologyController {
    terminology;
    constructor(terminology) {
        this.terminology = terminology;
    }
    getAll(user) {
        return this.terminology.getAll(user.businessId);
    }
    setMany(user, dto) {
        return this.terminology.setMany(user.businessId, dto.updates);
    }
};
exports.TerminologyController = TerminologyController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TerminologyController.prototype, "getAll", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LABELS_MANAGE),
    (0, common_1.Patch)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, set_labels_dto_1.SetLabelsDto]),
    __metadata("design:returntype", void 0)
], TerminologyController.prototype, "setMany", null);
exports.TerminologyController = TerminologyController = __decorate([
    (0, common_1.Controller)('labels'),
    __metadata("design:paramtypes", [terminology_service_1.TerminologyService])
], TerminologyController);
//# sourceMappingURL=terminology.controller.js.map