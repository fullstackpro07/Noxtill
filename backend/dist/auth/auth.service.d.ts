import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { Prisma } from '../../generated/prisma';
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly capabilities;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, capabilities: CapabilitiesService);
    signup(dto: SignupDto): Promise<{
        accessToken: string;
        refreshToken: string;
        business: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            slug: string;
            currency: string;
            timezone: string;
            locale: string;
            country: string | null;
            channelPref: import("../../generated/prisma").$Enums.MessageChannel;
            nightlyCloseTime: string;
            taxLabel: string;
            taxRate: Prisma.Decimal;
            msgQuota: number;
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
            trialEndsAt: Date | null;
            stripeCustomerId: string | null;
            stripeSubscriptionId: string | null;
            msgQuotaResetAt: Date | null;
            typeId: string | null;
            planId: string | null;
            parentId: string | null;
        };
        user: {
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
        };
    }>;
    refresh(refreshToken: string): Promise<TokenPair>;
    logout(userId: string): Promise<void>;
    private registerFailedAttempt;
    private issueTokens;
    private toPublicUser;
}
