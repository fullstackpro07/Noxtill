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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateLoyaltyProgramDto = exports.LoyaltyTierDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class LoyaltyTierDto {
    name;
    minSpend;
}
exports.LoyaltyTierDto = LoyaltyTierDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoyaltyTierDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], LoyaltyTierDto.prototype, "minSpend", void 0);
class CreateLoyaltyProgramDto {
    name;
    type;
    stampsRequired;
    rewardDescription;
    tiers;
}
exports.CreateLoyaltyProgramDto = CreateLoyaltyProgramDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLoyaltyProgramDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['punch_card', 'tier']),
    __metadata("design:type", String)
], CreateLoyaltyProgramDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateLoyaltyProgramDto.prototype, "stampsRequired", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLoyaltyProgramDto.prototype, "rewardDescription", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => LoyaltyTierDto),
    __metadata("design:type", Array)
], CreateLoyaltyProgramDto.prototype, "tiers", void 0);
//# sourceMappingURL=create-loyalty-program.dto.js.map