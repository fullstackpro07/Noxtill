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
exports.LoyaltyController = void 0;
const common_1 = require("@nestjs/common");
const loyalty_service_1 = require("./loyalty.service");
const create_loyalty_program_dto_1 = require("./dto/create-loyalty-program.dto");
const enroll_loyalty_member_dto_1 = require("./dto/enroll-loyalty-member.dto");
let LoyaltyController = class LoyaltyController {
    loyaltyService;
    constructor(loyaltyService) {
        this.loyaltyService = loyaltyService;
    }
    create(dto) {
        return this.loyaltyService.createProgram(dto);
    }
    list() {
        return this.loyaltyService.listPrograms();
    }
    enroll(id, dto) {
        return this.loyaltyService.enroll(id, dto);
    }
    listMembers(id) {
        return this.loyaltyService.listMembers(id);
    }
    redeem(id) {
        return this.loyaltyService.redeem(id);
    }
};
exports.LoyaltyController = LoyaltyController;
__decorate([
    (0, common_1.Post)('loyalty-programs'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_loyalty_program_dto_1.CreateLoyaltyProgramDto]),
    __metadata("design:returntype", void 0)
], LoyaltyController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('loyalty-programs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoyaltyController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('loyalty-programs/:id/enroll'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, enroll_loyalty_member_dto_1.EnrollLoyaltyMemberDto]),
    __metadata("design:returntype", void 0)
], LoyaltyController.prototype, "enroll", null);
__decorate([
    (0, common_1.Get)('loyalty-programs/:id/members'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoyaltyController.prototype, "listMembers", null);
__decorate([
    (0, common_1.Post)('loyalty-members/:id/redeem'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoyaltyController.prototype, "redeem", null);
exports.LoyaltyController = LoyaltyController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [loyalty_service_1.LoyaltyService])
], LoyaltyController);
//# sourceMappingURL=loyalty.controller.js.map