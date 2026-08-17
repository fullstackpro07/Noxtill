import { AiContentStudioService } from './ai-content-studio.service';
import { GenerateCaptionDto } from './dto/ai-content.dto';
import { GenerateMediaImageDto } from './dto/media.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AiContentController {
    private readonly studio;
    constructor(studio: AiContentStudioService);
    generateCaption(user: AuthenticatedUser, dto: GenerateCaptionDto): Promise<{
        caption: string;
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
}
