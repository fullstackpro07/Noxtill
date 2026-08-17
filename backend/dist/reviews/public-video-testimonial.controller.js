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
exports.PublicVideoTestimonialController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const throttler_1 = require("@nestjs/throttler");
const public_video_testimonial_service_1 = require("./public-video-testimonial.service");
const public_decorator_1 = require("../common/decorators/public.decorator");
let PublicVideoTestimonialController = class PublicVideoTestimonialController {
    publicVideoTestimonialService;
    constructor(publicVideoTestimonialService) {
        this.publicVideoTestimonialService = publicVideoTestimonialService;
    }
    getByToken(token) {
        return this.publicVideoTestimonialService.getByToken(token);
    }
    upload(token, file) {
        if (!file)
            throw new common_1.BadRequestException('video file is required');
        return this.publicVideoTestimonialService.upload(token, file);
    }
};
exports.PublicVideoTestimonialController = PublicVideoTestimonialController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('t/:token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicVideoTestimonialController.prototype, "getByToken", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    (0, common_1.Post)('t/:token'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('video')),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PublicVideoTestimonialController.prototype, "upload", null);
exports.PublicVideoTestimonialController = PublicVideoTestimonialController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [public_video_testimonial_service_1.PublicVideoTestimonialService])
], PublicVideoTestimonialController);
//# sourceMappingURL=public-video-testimonial.controller.js.map