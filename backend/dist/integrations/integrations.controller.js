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
exports.IntegrationsController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const integrations_service_1 = require("./integrations.service");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const public_decorator_1 = require("../common/decorators/public.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const prisma_1 = require("../../generated/prisma");
function parseProvider(value) {
    if (!Object.values(prisma_1.IntegrationProvider).includes(value)) {
        throw new common_1.BadRequestException(`Unknown integration provider: ${value}`);
    }
    return value;
}
let IntegrationsController = class IntegrationsController {
    integrations;
    config;
    constructor(integrations, config) {
        this.integrations = integrations;
        this.config = config;
    }
    list(user) {
        return this.integrations.list(user.businessId);
    }
    connect(user, provider) {
        return this.integrations.connect(user.businessId, parseProvider(provider));
    }
    disconnect(user, provider) {
        return this.integrations.disconnect(user.businessId, parseProvider(provider));
    }
    async callback(provider, code, state, res) {
        const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:3000';
        const parsedProvider = parseProvider(provider);
        try {
            const { ok } = await this.integrations.handleCallback(parsedProvider, code, state);
            res.redirect(ok
                ? `${frontendUrl}/integrations?connected=${parsedProvider}`
                : `${frontendUrl}/integrations?error=${parsedProvider}`);
        }
        catch {
            res.redirect(`${frontendUrl}/integrations?error=${parsedProvider}`);
        }
    }
};
exports.IntegrationsController = IntegrationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "list", null);
__decorate([
    (0, roles_decorator_1.Roles)(prisma_1.Role.owner, prisma_1.Role.manager),
    (0, common_1.Post)(':provider/connect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "connect", null);
__decorate([
    (0, roles_decorator_1.Roles)(prisma_1.Role.owner, prisma_1.Role.manager),
    (0, common_1.Post)(':provider/disconnect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "disconnect", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':provider/callback'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "callback", null);
exports.IntegrationsController = IntegrationsController = __decorate([
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [integrations_service_1.IntegrationsService,
        config_1.ConfigService])
], IntegrationsController);
//# sourceMappingURL=integrations.controller.js.map