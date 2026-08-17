import { SocialSettingsService } from './social-settings.service';
import { UpdateSocialSettingsDto } from './dto/social-settings.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class SocialSettingsController {
    private readonly settings;
    constructor(settings: SocialSettingsService);
    get(user: AuthenticatedUser): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        autoPostRules: import("generated/prisma/runtime/library").JsonValue;
        hashtagSets: import("generated/prisma/runtime/library").JsonValue;
        brandVoice: string | null;
    } | {
        id: null;
        businessId: string;
        autoPostRules: {};
        hashtagSets: {};
        brandVoice: null;
        createdAt: null;
        updatedAt: null;
    }>;
    update(user: AuthenticatedUser, dto: UpdateSocialSettingsDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        autoPostRules: import("generated/prisma/runtime/library").JsonValue;
        hashtagSets: import("generated/prisma/runtime/library").JsonValue;
        brandVoice: string | null;
    }>;
}
