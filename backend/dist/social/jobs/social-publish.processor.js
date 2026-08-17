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
var SocialPublishProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialPublishProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const social_posts_service_1 = require("../social-posts.service");
const social_constants_1 = require("../social.constants");
let SocialPublishProcessor = SocialPublishProcessor_1 = class SocialPublishProcessor extends bullmq_1.WorkerHost {
    posts;
    logger = new common_1.Logger(SocialPublishProcessor_1.name);
    constructor(posts) {
        super();
        this.posts = posts;
    }
    async process(job) {
        await this.posts.executePublish(job.data.businessId, job.data.postId);
        this.logger.debug(`Social post ${job.data.postId} publish executed`);
    }
};
exports.SocialPublishProcessor = SocialPublishProcessor;
exports.SocialPublishProcessor = SocialPublishProcessor = SocialPublishProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(social_constants_1.SOCIAL_PUBLISH_QUEUE),
    __metadata("design:paramtypes", [social_posts_service_1.SocialPostsService])
], SocialPublishProcessor);
//# sourceMappingURL=social-publish.processor.js.map