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
exports.SocialPostsController = void 0;
const common_1 = require("@nestjs/common");
const social_posts_service_1 = require("./social-posts.service");
const social_post_dto_1 = require("./dto/social-post.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
const prisma_1 = require("../../generated/prisma");
let SocialPostsController = class SocialPostsController {
    posts;
    constructor(posts) {
        this.posts = posts;
    }
    list(user, status) {
        return this.posts.list(user.businessId, status);
    }
    findOne(user, id) {
        return this.posts.findOne(user.businessId, id);
    }
    create(user, dto) {
        return this.posts.create(user.businessId, user.sub, dto);
    }
    publishNow(user, id) {
        return this.posts.publishNow(user.businessId, id);
    }
    remove(user, id) {
        return this.posts.remove(user.businessId, id);
    }
};
exports.SocialPostsController = SocialPostsController;
__decorate([
    (0, common_1.Get)('social/posts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialPostsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('social/posts/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialPostsController.prototype, "findOne", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)('social/posts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, social_post_dto_1.CreateSocialPostDto]),
    __metadata("design:returntype", void 0)
], SocialPostsController.prototype, "create", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)('social/posts/:id/publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialPostsController.prototype, "publishNow", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Delete)('social/posts/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialPostsController.prototype, "remove", null);
exports.SocialPostsController = SocialPostsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [social_posts_service_1.SocialPostsService])
], SocialPostsController);
//# sourceMappingURL=social-posts.controller.js.map