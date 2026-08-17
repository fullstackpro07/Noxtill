import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateSocialSettingsDto } from './dto/social-settings.dto';
export declare class SocialSettingsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    get(businessId: string): Promise<{
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
    update(businessId: string, dto: UpdateSocialSettingsDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        autoPostRules: import("generated/prisma/runtime/library").JsonValue;
        hashtagSets: import("generated/prisma/runtime/library").JsonValue;
        brandVoice: string | null;
    }>;
}
