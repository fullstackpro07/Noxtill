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
exports.VariantsController = void 0;
const common_1 = require("@nestjs/common");
const variants_service_1 = require("./variants.service");
const create_variant_set_dto_1 = require("./dto/create-variant-set.dto");
const update_variant_set_dto_1 = require("./dto/update-variant-set.dto");
const apply_variant_set_dto_1 = require("./dto/apply-variant-set.dto");
let VariantsController = class VariantsController {
    variantsService;
    constructor(variantsService) {
        this.variantsService = variantsService;
    }
    create(dto) {
        return this.variantsService.create(dto);
    }
    findAll() {
        return this.variantsService.findAll();
    }
    findOne(id) {
        return this.variantsService.findOne(id);
    }
    update(id, dto) {
        return this.variantsService.update(id, dto);
    }
    remove(id) {
        return this.variantsService.remove(id);
    }
    apply(id, dto) {
        return this.variantsService.apply(id, dto);
    }
};
exports.VariantsController = VariantsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_variant_set_dto_1.CreateVariantSetDto]),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_variant_set_dto_1.UpdateVariantSetDto]),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/apply'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, apply_variant_set_dto_1.ApplyVariantSetDto]),
    __metadata("design:returntype", void 0)
], VariantsController.prototype, "apply", null);
exports.VariantsController = VariantsController = __decorate([
    (0, common_1.Controller)('variants'),
    __metadata("design:paramtypes", [variants_service_1.VariantsService])
], VariantsController);
//# sourceMappingURL=variants.controller.js.map