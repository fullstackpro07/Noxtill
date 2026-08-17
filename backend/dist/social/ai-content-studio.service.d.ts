import { AiInfraService } from '../ai/ai-infra.service';
import { MediaLibraryService } from './media-library.service';
import { GenerateCaptionDto } from './dto/ai-content.dto';
import { GenerateMediaImageDto } from './dto/media.dto';
export declare class AiContentStudioService {
    private readonly aiInfra;
    private readonly mediaLibrary;
    constructor(aiInfra: AiInfraService, mediaLibrary: MediaLibraryService);
    generateCaption(businessId: string, dto: GenerateCaptionDto): Promise<{
        caption: string;
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
}
