"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const common_2 = require("@nestjs/common");
const slug_util_1 = require("../common/utils/slug.util");
const capabilities_service_1 = require("../common/capabilities/capabilities.service");
const prisma_1 = require("../../generated/prisma");
const BCRYPT_ROUNDS = 10;
let AuthService = class AuthService {
    prisma;
    jwt;
    config;
    capabilities;
    constructor(prisma, jwt, config, capabilities) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.capabilities = capabilities;
    }
    async signup(dto) {
        const identityFilters = [];
        if (dto.email)
            identityFilters.push({ email: dto.email });
        if (dto.phone)
            identityFilters.push({ phone: dto.phone });
        const existing = await this.prisma.user.findFirst({
            where: { OR: identityFilters },
        });
        if (existing) {
            throw new app_exception_1.AppException('ACCOUNT_EXISTS', 'This email already has an account — log in instead', common_2.HttpStatus.CONFLICT);
        }
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
        const { user, business, businessUser } = await this.prisma.$transaction(async (tx) => {
            const business = await tx.business.create({
                data: {
                    name: dto.businessName,
                    slug: (0, slug_util_1.slugify)(dto.businessName),
                    country: dto.country,
                    currency: dto.currency ?? 'USD',
                    locale: dto.locale ?? 'en',
                    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                },
            });
            const user = await tx.user.create({
                data: {
                    name: dto.name,
                    email: dto.email,
                    phone: dto.phone,
                    passwordHash,
                },
            });
            const businessUser = await tx.businessUser.create({
                data: { businessId: business.id, userId: user.id, role: prisma_1.Role.owner },
            });
            return { user, business, businessUser };
        });
        const tokens = await this.issueTokens(user.id, business.id, businessUser.role, businessUser.customRoleId);
        return { business, user: this.toPublicUser(user), ...tokens };
    }
    async login(dto) {
        const user = await this.prisma.user.findFirst({
            where: { OR: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }] },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new app_exception_1.AppException('ACCOUNT_LOCKED', `Too many failed attempts — try again after ${user.lockedUntil.toISOString()}`, common_2.HttpStatus.FORBIDDEN);
        }
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
        });
        const businessUser = await this.prisma.businessUser.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
        });
        if (!businessUser) {
            throw new common_1.UnauthorizedException('No business associated with this account');
        }
        const tokens = await this.issueTokens(user.id, businessUser.businessId, businessUser.role, businessUser.customRoleId);
        return { user: this.toPublicUser(user), ...tokens };
    }
    async refresh(refreshToken) {
        let payload;
        try {
            payload = await this.jwt.verifyAsync(refreshToken, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
        });
        if (!user?.refreshTokenHash) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
        if (!matches) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const businessUser = await this.prisma.businessUser.findFirst({
            where: { userId: payload.sub, businessId: payload.businessId },
        });
        if (!businessUser) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        return this.issueTokens(payload.sub, payload.businessId, businessUser.role, businessUser.customRoleId);
    }
    async logout(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshTokenHash: null },
        });
    }
    async registerFailedAttempt(userId, currentAttempts) {
        const maxAttempts = Number(this.config.get('LOGIN_MAX_ATTEMPTS') ?? 5);
        const lockMinutes = Number(this.config.get('LOGIN_LOCK_MINUTES') ?? 15);
        const attempts = currentAttempts + 1;
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                failedLoginAttempts: attempts,
                lockedUntil: attempts >= maxAttempts
                    ? new Date(Date.now() + lockMinutes * 60 * 1000)
                    : undefined,
            },
        });
    }
    async issueTokens(userId, businessId, role, customRoleId) {
        const capabilities = await this.capabilities.resolve({ role, customRoleId });
        const payload = { sub: userId, businessId, role, capabilities };
        const accessToken = await this.jwt.signAsync(payload, {
            secret: this.config.get('JWT_SECRET'),
            expiresIn: (this.config.get('JWT_ACCESS_TTL') ??
                '15m'),
        });
        const refreshToken = await this.jwt.signAsync(payload, {
            secret: this.config.get('JWT_REFRESH_SECRET'),
            expiresIn: (this.config.get('JWT_REFRESH_TTL') ??
                '7d'),
        });
        const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshTokenHash },
        });
        return { accessToken, refreshToken };
    }
    toPublicUser(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        capabilities_service_1.CapabilitiesService])
], AuthService);
//# sourceMappingURL=auth.service.js.map