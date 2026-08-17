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
exports.CustomRolesController = void 0;
const common_1 = require("@nestjs/common");
const custom_roles_service_1 = require("./custom-roles.service");
const create_custom_role_dto_1 = require("./dto/create-custom-role.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let CustomRolesController = class CustomRolesController {
    customRoles;
    constructor(customRoles) {
        this.customRoles = customRoles;
    }
    listCapabilities() {
        return capabilities_constants_1.ALL_CAPABILITIES;
    }
    create(user, dto) {
        return this.customRoles.create(user.businessId, dto);
    }
    list() {
        return this.customRoles.list();
    }
    findOne(id) {
        return this.customRoles.findOne(id);
    }
    update(id, dto) {
        return this.customRoles.update(id, dto);
    }
    remove(id) {
        return this.customRoles.remove(id);
    }
};
exports.CustomRolesController = CustomRolesController;
__decorate([
    (0, common_1.Get)('capabilities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "listCapabilities", null);
__decorate([
    (0, common_1.Post)('roles'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_custom_role_dto_1.CreateCustomRoleDto]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('roles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)('roles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_custom_role_dto_1.UpdateCustomRoleDto]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('roles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "remove", null);
exports.CustomRolesController = CustomRolesController = __decorate([
    (0, common_1.Controller)(),
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.ROLES_MANAGE),
    __metadata("design:paramtypes", [custom_roles_service_1.CustomRolesService])
], CustomRolesController);
//# sourceMappingURL=custom-roles.controller.js.map