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
exports.EmailCampaignsController = void 0;
const common_1 = require("@nestjs/common");
const email_campaigns_service_1 = require("./email-campaigns.service");
const create_email_campaign_dto_1 = require("./dto/create-email-campaign.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let EmailCampaignsController = class EmailCampaignsController {
    emailCampaigns;
    constructor(emailCampaigns) {
        this.emailCampaigns = emailCampaigns;
    }
    create(user, dto) {
        return this.emailCampaigns.create(user.businessId, dto);
    }
    list(user) {
        return this.emailCampaigns.list(user.businessId);
    }
    funnel(user, id) {
        return this.emailCampaigns.funnel(user.businessId, id);
    }
    listHealth(user) {
        return this.emailCampaigns.listHealth(user.businessId);
    }
    unsubscribe(token) {
        return this.emailCampaigns.unsubscribe(token);
    }
};
exports.EmailCampaignsController = EmailCampaignsController;
__decorate([
    (0, common_1.Post)('campaigns'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_email_campaign_dto_1.CreateEmailCampaignDto]),
    __metadata("design:returntype", void 0)
], EmailCampaignsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('campaigns'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EmailCampaignsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('campaigns/:id/funnel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EmailCampaignsController.prototype, "funnel", null);
__decorate([
    (0, common_1.Get)('list-health'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EmailCampaignsController.prototype, "listHealth", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('unsubscribe'),
    __param(0, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EmailCampaignsController.prototype, "unsubscribe", null);
exports.EmailCampaignsController = EmailCampaignsController = __decorate([
    (0, common_1.Controller)('integrations/email'),
    __metadata("design:paramtypes", [email_campaigns_service_1.EmailCampaignsService])
], EmailCampaignsController);
//# sourceMappingURL=email-campaigns.controller.js.map