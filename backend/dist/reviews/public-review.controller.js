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
exports.PublicReviewController = void 0;
const common_1 = require("@nestjs/common");
const public_review_service_1 = require("./public-review.service");
const submit_review_dto_1 = require("./dto/submit-review.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
let PublicReviewController = class PublicReviewController {
    publicReviewService;
    constructor(publicReviewService) {
        this.publicReviewService = publicReviewService;
    }
    getByToken(token) {
        return this.publicReviewService.getByToken(token);
    }
    submit(token, dto) {
        return this.publicReviewService.submit(token, dto);
    }
    widget(biz) {
        return this.publicReviewService.getWidget(biz);
    }
};
exports.PublicReviewController = PublicReviewController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('r/:token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicReviewController.prototype, "getByToken", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('r/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, submit_review_dto_1.SubmitReviewDto]),
    __metadata("design:returntype", void 0)
], PublicReviewController.prototype, "submit", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('reviews/widget/:biz'),
    __param(0, (0, common_1.Param)('biz')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicReviewController.prototype, "widget", null);
exports.PublicReviewController = PublicReviewController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [public_review_service_1.PublicReviewService])
], PublicReviewController);
//# sourceMappingURL=public-review.controller.js.map