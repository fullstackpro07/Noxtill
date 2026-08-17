"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const sessions_service_1 = require("./sessions.service");
const sessions_controller_1 = require("./sessions.controller");
const two_factor_service_1 = require("./two-factor.service");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const messaging_module_1 = require("../messaging/messaging.module");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [passport_1.PassportModule, jwt_1.JwtModule.register({}), messaging_module_1.MessagingModule],
        controllers: [auth_controller_1.AuthController, sessions_controller_1.SessionsController],
        providers: [auth_service_1.AuthService, sessions_service_1.SessionsService, two_factor_service_1.TwoFactorService, jwt_strategy_1.JwtStrategy],
        exports: [auth_service_1.AuthService, sessions_service_1.SessionsService],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map