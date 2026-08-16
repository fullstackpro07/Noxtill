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
exports.VideoTestimonialsController = void 0;
const common_1 = require("@nestjs/common");
const video_testimonials_service_1 = require("./video-testimonials.service");
const request_video_testimonial_dto_1 = require("./dto/request-video-testimonial.dto");
const reject_video_testimonial_dto_1 = require("./dto/reject-video-testimonial.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const prisma_1 = require("../../generated/prisma");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let VideoTestimonialsController = class VideoTestimonialsController {
    videoTestimonialsService;
    constructor(videoTestimonialsService) {
        this.videoTestimonialsService = videoTestimonialsService;
    }
    request(user, dto) {
        return this.videoTestimonialsService.request(user.businessId, dto);
    }
    list(status) {
        return this.videoTestimonialsService.list(status);
    }
    findOne(id) {
        return this.videoTestimonialsService.findOne(id);
    }
    approve(user, id) {
        return this.videoTestimonialsService.approve(id, user.sub);
    }
    reject(user, id, dto) {
        return this.videoTestimonialsService.reject(id, dto, user.sub);
    }
};
exports.VideoTestimonialsController = VideoTestimonialsController;
__decorate([
    (0, common_1.Post)('request'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, request_video_testimonial_dto_1.RequestVideoTestimonialDto]),
    __metadata("design:returntype", void 0)
], VideoTestimonialsController.prototype, "request", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VideoTestimonialsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VideoTestimonialsController.prototype, "findOne", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE),
    (0, common_1.Patch)(':id/approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VideoTestimonialsController.prototype, "approve", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE),
    (0, common_1.Patch)(':id/reject'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, reject_video_testimonial_dto_1.RejectVideoTestimonialDto]),
    __metadata("design:returntype", void 0)
], VideoTestimonialsController.prototype, "reject", null);
exports.VideoTestimonialsController = VideoTestimonialsController = __decorate([
    (0, common_1.Controller)('video-testimonials'),
    __metadata("design:paramtypes", [video_testimonials_service_1.VideoTestimonialsService])
], VideoTestimonialsController);
//# sourceMappingURL=video-testimonials.controller.js.map