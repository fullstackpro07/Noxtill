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
exports.BranchesController = void 0;
const common_1 = require("@nestjs/common");
const rollup_service_1 = require("./rollup.service");
const branch_advisor_service_1 = require("./branch-advisor.service");
const branch_management_service_1 = require("./branch-management.service");
const branch_advisor_dto_1 = require("./dto/branch-advisor.dto");
const create_branch_dto_1 = require("./dto/create-branch.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let BranchesController = class BranchesController {
    rollupService;
    branchAdvisorService;
    branchManagementService;
    constructor(rollupService, branchAdvisorService, branchManagementService) {
        this.rollupService = rollupService;
        this.branchAdvisorService = branchAdvisorService;
        this.branchManagementService = branchManagementService;
    }
    createBranch(user, dto) {
        return this.branchManagementService.create(user.businessId, dto);
    }
    listBranches(user) {
        return this.branchManagementService.list(user.businessId);
    }
    dashboard(user, days) {
        return this.rollupService.dashboard(user.businessId, days ? Number(days) : undefined);
    }
    compare(user, weeks) {
        return this.rollupService.compare(user.businessId, weeks ? Number(weeks) : undefined);
    }
    branchAdvisor(user, dto) {
        return this.branchAdvisorService.ask(user.businessId, dto);
    }
};
exports.BranchesController = BranchesController;
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.BRANCHES_MANAGE),
    (0, common_1.Post)('branches'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_branch_dto_1.CreateBranchDto]),
    __metadata("design:returntype", void 0)
], BranchesController.prototype, "createBranch", null);
__decorate([
    (0, common_1.Get)('branches'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BranchesController.prototype, "listBranches", null);
__decorate([
    (0, common_1.Get)('rollup/dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BranchesController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('rollup/compare'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('weeks')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BranchesController.prototype, "compare", null);
__decorate([
    (0, common_1.Post)('ai/branch-advisor'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, branch_advisor_dto_1.BranchAdvisorDto]),
    __metadata("design:returntype", void 0)
], BranchesController.prototype, "branchAdvisor", null);
exports.BranchesController = BranchesController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [rollup_service_1.RollupService,
        branch_advisor_service_1.BranchAdvisorService,
        branch_management_service_1.BranchManagementService])
], BranchesController);
//# sourceMappingURL=branches.controller.js.map