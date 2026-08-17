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
exports.SocialAccountsController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const class_validator_1 = require("class-validator");
const social_accounts_service_1 = require("./social-accounts.service");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const public_decorator_1 = require("../common/decorators/public.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
const social_platform_util_1 = require("./social-platform.util");
class ConnectWithTokenDto {
    token;
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConnectWithTokenDto.prototype, "token", void 0);
let SocialAccountsController = class SocialAccountsController {
    accounts;
    config;
    constructor(accounts, config) {
        this.accounts = accounts;
        this.config = config;
    }
    list(user) {
        return this.accounts.list(user.businessId);
    }
    connect(user, platform) {
        return this.accounts.connect(user.businessId, (0, social_platform_util_1.parseSocialPlatform)(platform));
    }
    connectWithToken(user, platform, dto) {
        return this.accounts.connectWithToken(user.businessId, (0, social_platform_util_1.parseSocialPlatform)(platform), dto.token);
    }
    disconnect(user, platform) {
        return this.accounts.disconnect(user.businessId, (0, social_platform_util_1.parseSocialPlatform)(platform));
    }
    async callback(platform, code, state, res) {
        const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:3000';
        const parsedPlatform = (0, social_platform_util_1.parseSocialPlatform)(platform);
        try {
            const { ok } = await this.accounts.handleCallback(parsedPlatform, code, state);
            res.redirect(ok
                ? `${frontendUrl}/social?connected=${parsedPlatform}`
                : `${frontendUrl}/social?error=${parsedPlatform}`);
        }
        catch {
            res.redirect(`${frontendUrl}/social?error=${parsedPlatform}`);
        }
    }
};
exports.SocialAccountsController = SocialAccountsController;
__decorate([
    (0, common_1.Get)('social/accounts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SocialAccountsController.prototype, "list", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)('social/:platform/connect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialAccountsController.prototype, "connect", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)('social/:platform/connect-with-token'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('platform')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ConnectWithTokenDto]),
    __metadata("design:returntype", void 0)
], SocialAccountsController.prototype, "connectWithToken", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.SOCIAL_MANAGE),
    (0, common_1.Post)('social/:platform/disconnect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SocialAccountsController.prototype, "disconnect", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('social/:platform/callback'),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], SocialAccountsController.prototype, "callback", null);
exports.SocialAccountsController = SocialAccountsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [social_accounts_service_1.SocialAccountsService,
        config_1.ConfigService])
], SocialAccountsController);
//# sourceMappingURL=social-accounts.controller.js.map