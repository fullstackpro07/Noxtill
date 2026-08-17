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
exports.SocialAnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const social_analytics_service_1 = require("./social-analytics.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const social_platform_util_1 = require("./social-platform.util");
let SocialAnalyticsController = class SocialAnalyticsController {
    analytics;
    constructor(analytics) {
        this.analytics = analytics;
    }
    summary(user) {
        return this.analytics.summary(user.businessId);
    }
    list(user, platform) {
        return this.analytics.list(user.businessId, (0, social_platform_util_1.parseSocialPlatform)(platform));
    }
};
exports.SocialAnalyticsController = SocialAnalyticsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SocialAnalyticsController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)(':platform'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialAnalyticsController.prototype, "list", null);
exports.SocialAnalyticsController = SocialAnalyticsController = __decorate([
    (0, common_1.Controller)('social/analytics'),
    __metadata("design:paramtypes", [social_analytics_service_1.SocialAnalyticsService])
], SocialAnalyticsController);
//# sourceMappingURL=social-analytics.controller.js.map