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
exports.MediaAssetTypeQueryDto = exports.MEDIA_ASSET_TYPES = exports.UpdateMediaAssetDto = exports.GenerateMediaImageDto = void 0;
const class_validator_1 = require("class-validator");
class GenerateMediaImageDto {
    prompt;
    tags;
}
exports.GenerateMediaImageDto = GenerateMediaImageDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateMediaImageDto.prototype, "prompt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GenerateMediaImageDto.prototype, "tags", void 0);
class UpdateMediaAssetDto {
    tags;
}
exports.UpdateMediaAssetDto = UpdateMediaAssetDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateMediaAssetDto.prototype, "tags", void 0);
exports.MEDIA_ASSET_TYPES = ['image', 'video'];
class MediaAssetTypeQueryDto {
    type;
}
exports.MediaAssetTypeQueryDto = MediaAssetTypeQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.MEDIA_ASSET_TYPES),
    __metadata("design:type", Object)
], MediaAssetTypeQueryDto.prototype, "type", void 0);
//# sourceMappingURL=media.dto.js.map