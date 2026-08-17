import { BusinessTypesService } from './business-types.service';
import { AiMapBusinessTypeDto } from './dto/ai-map-business-type.dto';
export declare class BusinessTypesController {
    private readonly businessTypesService;
    constructor(businessTypesService: BusinessTypesService);
    search(q?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        labelOverrides: import("generated/prisma/runtime/library").JsonValue;
        key: string;
        categoryId: string;
        label: string;
        widgetOverrides: import("generated/prisma/runtime/library").JsonValue;
        aiGenerated: boolean;
    }[]>;
    aiMap(dto: AiMapBusinessTypeDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        labelOverrides: import("generated/prisma/runtime/library").JsonValue;
        key: string;
        categoryId: string;
        label: string;
        widgetOverrides: import("generated/prisma/runtime/library").JsonValue;
        aiGenerated: boolean;
    }>;
}
