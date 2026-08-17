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
exports.SelectGmbLocationDto = exports.AnswerGmbQnaDto = exports.CreateGmbPhotoDto = exports.CreateGmbPostDto = void 0;
const class_validator_1 = require("class-validator");
class CreateGmbPostDto {
    text;
    photoUrl;
    buttonType;
    scheduledFor;
}
exports.CreateGmbPostDto = CreateGmbPostDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGmbPostDto.prototype, "text", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGmbPostDto.prototype, "photoUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGmbPostDto.prototype, "buttonType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateGmbPostDto.prototype, "scheduledFor", void 0);
class CreateGmbPhotoDto {
    url;
    category;
}
exports.CreateGmbPhotoDto = CreateGmbPhotoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGmbPhotoDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGmbPhotoDto.prototype, "category", void 0);
class AnswerGmbQnaDto {
    answer;
}
exports.AnswerGmbQnaDto = AnswerGmbQnaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AnswerGmbQnaDto.prototype, "answer", void 0);
class SelectGmbLocationDto {
    locationId;
}
exports.SelectGmbLocationDto = SelectGmbLocationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SelectGmbLocationDto.prototype, "locationId", void 0);
//# sourceMappingURL=gmb.dto.js.map