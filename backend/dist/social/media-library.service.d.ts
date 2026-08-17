import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { GenerateMediaImageDto, UpdateMediaAssetDto } from './dto/media.dto';
export declare class MediaLibraryService {
    private readonly tenantPrisma;
    private readonly s3;
    private readonly aiInfra;
    constructor(tenantPrisma: TenantPrismaService, s3: S3Service, aiInfra: AiInfraService);
    list(businessId: string, type?: string): Promise<{
        url: string;
        id: string;
        businessId: string;
        createdAt: Date;
        tags: import("generated/prisma/runtime/library").JsonValue;
        source: string;
        type: string;
        key: string;
        prompt: string | null;
        usageCount: number;
    }[]>;
    upload(businessId: string, file: {
        buffer: Buffer;
        size: number;
        mimetype: string;
    }): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        tags: import("generated/prisma/runtime/library").JsonValue;
        source: string;
        type: string;
        key: string;
        prompt: string | null;
        usageCount: number;
    }>;
    generateImage(businessId: string, dto: GenerateMediaImageDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        tags: import("generated/prisma/runtime/library").JsonValue;
        source: string;
        type: string;
        key: string;
        prompt: string | null;
        usageCount: number;
    }>;
    update(businessId: string, id: string, dto: UpdateMediaAssetDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        tags: import("generated/prisma/runtime/library").JsonValue;
        source: string;
        type: string;
        key: string;
        prompt: string | null;
        usageCount: number;
    }>;
    remove(businessId: string, id: string): Promise<void>;
    incrementUsage(businessId: string, key: string): Promise<void>;
    private find;
}
