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
exports.WorkflowsController = void 0;
const common_1 = require("@nestjs/common");
const workflows_service_1 = require("./workflows.service");
const create_workflow_dto_1 = require("./dto/create-workflow.dto");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const require_capability_decorator_1 = require("../../common/decorators/require-capability.decorator");
const prisma_1 = require("../../../generated/prisma");
const capabilities_constants_1 = require("../../common/capabilities/capabilities.constants");
let WorkflowsController = class WorkflowsController {
    workflows;
    constructor(workflows) {
        this.workflows = workflows;
    }
    create(user, dto) {
        return this.workflows.create(user.businessId, dto);
    }
    list(triggerKey) {
        return this.workflows.list(triggerKey);
    }
    findOne(id) {
        return this.workflows.findOne(id);
    }
    update(id, dto) {
        return this.workflows.update(id, dto);
    }
    remove(id) {
        return this.workflows.remove(id);
    }
    listRuns(id) {
        return this.workflows.listRuns(id);
    }
    test(id) {
        return this.workflows.test(id);
    }
};
exports.WorkflowsController = WorkflowsController;
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.AUTOMATIONS_MANAGE),
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_workflow_dto_1.CreateWorkflowDto]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('triggerKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "findOne", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.AUTOMATIONS_MANAGE),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_workflow_dto_1.UpdateWorkflowDto]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "update", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.AUTOMATIONS_MANAGE),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/runs'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "listRuns", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.AUTOMATIONS_MANAGE),
    (0, common_1.Post)(':id/test'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowsController.prototype, "test", null);
exports.WorkflowsController = WorkflowsController = __decorate([
    (0, common_1.Controller)('workflows'),
    __metadata("design:paramtypes", [workflows_service_1.WorkflowsService])
], WorkflowsController);
//# sourceMappingURL=workflows.controller.js.map