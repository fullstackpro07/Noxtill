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
exports.OptionsController = void 0;
const common_1 = require("@nestjs/common");
const options_service_1 = require("./options.service");
const option_set_dto_1 = require("./dto/option-set.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let OptionsController = class OptionsController {
    options;
    constructor(options) {
        this.options = options;
    }
    createSet(user, dto) {
        return this.options.createSet(user.businessId, dto);
    }
    listAll() {
        return this.options.listAll();
    }
    addOption(setKey, dto) {
        return this.options.addOption(setKey, dto);
    }
    updateOption(setKey, id, dto) {
        return this.options.updateOption(setKey, id, dto);
    }
    removeOption(setKey, id) {
        return this.options.removeOption(setKey, id);
    }
    reorder(setKey, dto) {
        return this.options.reorder(setKey, dto);
    }
};
exports.OptionsController = OptionsController;
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.OPTIONS_MANAGE),
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, option_set_dto_1.CreateOptionSetDto]),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "createSet", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "listAll", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.OPTIONS_MANAGE),
    (0, common_1.Post)(':setKey/items'),
    __param(0, (0, common_1.Param)('setKey')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, option_set_dto_1.CreateOptionDto]),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "addOption", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.OPTIONS_MANAGE),
    (0, common_1.Patch)(':setKey/items/:id'),
    __param(0, (0, common_1.Param)('setKey')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, option_set_dto_1.UpdateOptionDto]),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "updateOption", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.OPTIONS_MANAGE),
    (0, common_1.Delete)(':setKey/items/:id'),
    __param(0, (0, common_1.Param)('setKey')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "removeOption", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.OPTIONS_MANAGE),
    (0, common_1.Patch)(':setKey/reorder'),
    __param(0, (0, common_1.Param)('setKey')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, option_set_dto_1.ReorderOptionsDto]),
    __metadata("design:returntype", void 0)
], OptionsController.prototype, "reorder", null);
exports.OptionsController = OptionsController = __decorate([
    (0, common_1.Controller)('options'),
    __metadata("design:paramtypes", [options_service_1.OptionsService])
], OptionsController);
//# sourceMappingURL=options.controller.js.map