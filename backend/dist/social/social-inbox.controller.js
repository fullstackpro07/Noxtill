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
exports.SocialInboxController = void 0;
const common_1 = require("@nestjs/common");
const social_inbox_service_1 = require("./social-inbox.service");
const social_inbox_dto_1 = require("./dto/social-inbox.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
const prisma_1 = require("../../generated/prisma");
let SocialInboxController = class SocialInboxController {
    inbox;
    constructor(inbox) {
        this.inbox = inbox;
    }
    list(user, status) {
        return this.inbox.list(user.businessId, status);
    }
    reply(user, id, dto) {
        return this.inbox.reply(user.businessId, id, dto.text);
    }
    markRead(user, id) {
        return this.inbox.markRead(user.businessId, id);
    }
};
exports.SocialInboxController = SocialInboxController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialInboxController.prototype, "list", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)(':id/reply'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, social_inbox_dto_1.ReplyInboxItemDto]),
    __metadata("design:returntype", void 0)
], SocialInboxController.prototype, "reply", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Patch)(':id/read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialInboxController.prototype, "markRead", null);
exports.SocialInboxController = SocialInboxController = __decorate([
    (0, common_1.Controller)('social/inbox'),
    __metadata("design:paramtypes", [social_inbox_service_1.SocialInboxService])
], SocialInboxController);
//# sourceMappingURL=social-inbox.controller.js.map