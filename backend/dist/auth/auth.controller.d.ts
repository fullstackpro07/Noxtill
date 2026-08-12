import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    signup(dto: SignupDto): Promise<{
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
            slug: string;
            timezone: string;
            channelPref: import("generated/prisma").$Enums.MessageChannel;
            nightlyCloseTime: string;
            taxLabel: string;
            taxRate: import("generated/prisma/runtime/library").Decimal;
            msgQuota: number;
            msgUsed: number;
            branding: import("generated/prisma/runtime/library").JsonValue;
            dashboardConfig: import("generated/prisma/runtime/library").JsonValue;
            publicReviewUrl: string | null;
            workingHours: import("generated/prisma/runtime/library").JsonValue;
            referralSettings: import("generated/prisma/runtime/library").JsonValue;
            healthScoreWeights: import("generated/prisma/runtime/library").JsonValue;
            aiMonthlyCostCapUsd: import("generated/prisma/runtime/library").Decimal;
            aiRateLimitPerMinute: number;
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
    refresh(dto: RefreshDto): Promise<import("./auth.service").TokenPair>;
    logout(user: AuthenticatedUser): Promise<void>;
}
