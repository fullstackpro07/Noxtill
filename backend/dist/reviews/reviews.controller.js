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
exports.ReviewsController = void 0;
const common_1 = require("@nestjs/common");
const reviews_service_1 = require("./reviews.service");
const review_requests_service_1 = require("./review-requests.service");
const create_review_request_dto_1 = require("./dto/create-review-request.dto");
const query_reviews_dto_1 = require("./dto/query-reviews.dto");
const update_feedback_dto_1 = require("./dto/update-feedback.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let ReviewsController = class ReviewsController {
    reviewsService;
    reviewRequests;
    constructor(reviewsService, reviewRequests) {
        this.reviewsService = reviewsService;
        this.reviewRequests = reviewRequests;
    }
    createRequest(user, dto) {
        return this.reviewRequests.create(user.businessId, dto);
    }
    list(query) {
        return this.reviewsService.list(query);
    }
    reply(id, replyText) {
        return this.reviewsService.reply(id, replyText);
    }
    aiDraft(id) {
        return this.reviewsService.aiDraft(id);
    }
    updateFeedback(id, dto) {
        return this.reviewsService.updateFeedback(id, dto);
    }
};
exports.ReviewsController = ReviewsController;
__decorate([
    (0, common_1.Post)('reviews/requests'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_review_request_dto_1.CreateReviewRequestDto]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "createRequest", null);
__decorate([
    (0, common_1.Get)('reviews'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_reviews_dto_1.QueryReviewsDto]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('reviews/:id/reply'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('replyText')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "reply", null);
__decorate([
    (0, common_1.Post)('reviews/:id/ai-draft'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "aiDraft", null);
__decorate([
    (0, common_1.Patch)('feedback/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_feedback_dto_1.UpdateFeedbackDto]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "updateFeedback", null);
exports.ReviewsController = ReviewsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [reviews_service_1.ReviewsService,
        review_requests_service_1.ReviewRequestsService])
], ReviewsController);
//# sourceMappingURL=reviews.controller.js.map