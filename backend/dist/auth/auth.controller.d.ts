import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { Confirm2faDto } from './dto/confirm-2fa.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    signup(dto: SignupDto, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
        business: {
            name: string;
            country: string | null;
            currency: string;
            locale: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            planId: string | null;
            stripeSubscriptionId: string | null;
            msgQuota: number;
            slug: string;
            typeId: string | null;
            timezone: string;
            channelPref: import("generated/prisma").$Enums.MessageChannel;
            nightlyCloseTime: string;
            taxLabel: string;
            taxRate: import("generated/prisma/runtime/library").Decimal;
            msgUsed: number;
            branding: import("generated/prisma/runtime/library").JsonValue;
            dashboardConfig: import("generated/prisma/runtime/library").JsonValue;
            publicReviewUrl: string | null;
            workingHours: import("generated/prisma/runtime/library").JsonValue;
            referralSettings: import("generated/prisma/runtime/library").JsonValue;
            healthScoreWeights: import("generated/prisma/runtime/library").JsonValue;
            aiMonthlyCostCapUsd: import("generated/prisma/runtime/library").Decimal;
            aiRateLimitPerMinute: number;
            overtimeThresholdHoursPerWeek: number;
            parentId: string | null;
            trialEndsAt: Date | null;
            stripeCustomerId: string | null;
            msgQuotaResetAt: Date | null;
        };
        user: {
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
        };
    }>;
    login(dto: LoginDto, req: Request): Promise<import("./auth.service").LoginSuccess | import("./auth.service").Pending2fa>;
    verifyTwoFactorLogin(dto: Verify2faDto, req: Request): Promise<import("./auth.service").LoginSuccess>;
    enableTwoFactor(user: AuthenticatedUser): Promise<{
        sent: boolean;
    }>;
    confirmTwoFactor(user: AuthenticatedUser, dto: Confirm2faDto): Promise<{
        enabled: boolean;
    }>;
    disableTwoFactor(user: AuthenticatedUser, dto: Disable2faDto): Promise<{
        enabled: boolean;
    }>;
    refresh(dto: RefreshDto): Promise<import("./auth.service").TokenPair>;
    logout(user: AuthenticatedUser): Promise<void>;
}
