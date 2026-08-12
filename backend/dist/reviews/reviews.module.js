"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const review_requests_service_1 = require("./review-requests.service");
const reviews_service_1 = require("./reviews.service");
const public_review_service_1 = require("./public-review.service");
const qr_poster_service_1 = require("./qr-poster.service");
const reviews_controller_1 = require("./reviews.controller");
const public_review_controller_1 = require("./public-review.controller");
const review_reminders_scheduler_1 = require("./jobs/review-reminders.scheduler");
const review_reminders_processor_1 = require("./jobs/review-reminders.processor");
const review_reminders_constants_1 = require("./jobs/review-reminders.constants");
const google_sync_scheduler_1 = require("./jobs/google-sync.scheduler");
const google_sync_processor_1 = require("./jobs/google-sync.processor");
const google_sync_constants_1 = require("./jobs/google-sync.constants");
const messaging_module_1 = require("../messaging/messaging.module");
const ai_module_1 = require("../ai/ai.module");
const activity_module_1 = require("../activity/activity.module");
let ReviewsModule = class ReviewsModule {
};
exports.ReviewsModule = ReviewsModule;
exports.ReviewsModule = ReviewsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: review_reminders_constants_1.REVIEW_REMINDERS_QUEUE }, { name: google_sync_constants_1.GOOGLE_SYNC_QUEUE }),
            messaging_module_1.MessagingModule,
            ai_module_1.AiModule,
            activity_module_1.ActivityModule,
        ],
        controllers: [reviews_controller_1.ReviewsController, public_review_controller_1.PublicReviewController],
        providers: [
            review_requests_service_1.ReviewRequestsService,
            reviews_service_1.ReviewsService,
            public_review_service_1.PublicReviewService,
            qr_poster_service_1.QrPosterService,
            review_reminders_scheduler_1.ReviewRemindersScheduler,
            review_reminders_processor_1.ReviewRemindersProcessor,
            google_sync_scheduler_1.GoogleSyncScheduler,
            google_sync_processor_1.GoogleSyncProcessor,
        ],
        exports: [review_requests_service_1.ReviewRequestsService],
    })
], ReviewsModule);
//# sourceMappingURL=reviews.module.js.map