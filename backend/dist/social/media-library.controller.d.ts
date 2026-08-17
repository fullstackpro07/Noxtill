import { MediaLibraryService } from './media-library.service';
import { GenerateMediaImageDto, UpdateMediaAssetDto } from './dto/media.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class MediaLibraryController {
    private readonly media;
    constructor(media: MediaLibraryService);
    list(user: AuthenticatedUser, type?: string): Promise<{
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
    upload(user: AuthenticatedUser, file?: Express.Multer.File): Promise<{
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
    generateImage(user: AuthenticatedUser, dto: GenerateMediaImageDto): Promise<{
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
    update(user: AuthenticatedUser, id: string, dto: UpdateMediaAssetDto): Promise<{
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
    remove(user: AuthenticatedUser, id: string): Promise<void>;
}
