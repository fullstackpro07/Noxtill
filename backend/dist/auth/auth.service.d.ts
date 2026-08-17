import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';
import { Prisma } from '../../generated/prisma';
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
interface RequestMeta {
    userAgent?: string;
    ipAddress?: string;
}
export interface PublicUser {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
}
export interface LoginSuccess extends TokenPair {
    user: PublicUser;
}
export interface Pending2fa {
    pending2fa: true;
    tempToken: string;
}
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly capabilities;
    private readonly sessions;
    private readonly twoFactor;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, capabilities: CapabilitiesService, sessions: SessionsService, twoFactor: TwoFactorService);
    signup(dto: SignupDto, meta?: RequestMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        business: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            msgQuota: number;
            slug: string;
            typeId: string | null;
            planId: string | null;
            currency: string;
            timezone: string;
            locale: string;
            country: string | null;
            channelPref: import("../../generated/prisma").$Enums.MessageChannel;
            nightlyCloseTime: string;
            taxLabel: string;
            taxRate: Prisma.Decimal;
            msgUsed: number;
            branding: Prisma.JsonValue;
            dashboardConfig: Prisma.JsonValue;
            publicReviewUrl: string | null;
            workingHours: Prisma.JsonValue;
            referralSettings: Prisma.JsonValue;
            healthScoreWeights: Prisma.JsonValue;
            aiMonthlyCostCapUsd: Prisma.Decimal;
            aiRateLimitPerMinute: number;
            overtimeThresholdHoursPerWeek: number;
            parentId: string | null;
            trialEndsAt: Date | null;
            stripeCustomerId: string | null;
            stripeSubscriptionId: string | null;
            msgQuotaResetAt: Date | null;
        };
        user: {
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
        };
    }>;
    login(dto: LoginDto, meta?: RequestMeta): Promise<LoginSuccess | Pending2fa>;
    verifyTwoFactorLogin(tempToken: string, code: string, meta?: RequestMeta): Promise<LoginSuccess>;
    enableTwoFactor(userId: string, businessId: string): Promise<{
        sent: boolean;
    }>;
    confirmTwoFactor(userId: string, code: string): Promise<{
        enabled: boolean;
    }>;
    disableTwoFactor(userId: string, password: string): Promise<{
        enabled: boolean;
    }>;
    refresh(refreshToken: string): Promise<TokenPair>;
    logout(sessionId?: string): Promise<void>;
    private registerFailedAttempt;
    private issueTokens;
    private issuePendingTwoFactorToken;
    private pendingTwoFactorSecret;
    private toPublicUser;
}
export {};
