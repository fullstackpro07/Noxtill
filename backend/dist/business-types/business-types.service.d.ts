import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AiMapBusinessTypeDto } from './dto/ai-map-business-type.dto';
export declare class BusinessTypesService {
    private readonly prisma;
    private readonly aiInfra;
    constructor(prisma: PrismaService, aiInfra: AiInfraService);
    search(query?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
        label: string;
        categoryId: string;
        labelOverrides: import("generated/prisma/runtime/library").JsonValue;
        widgetOverrides: import("generated/prisma/runtime/library").JsonValue;
        aiGenerated: boolean;
    }[]>;
    aiMap(dto: AiMapBusinessTypeDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
        label: string;
        categoryId: string;
        labelOverrides: import("generated/prisma/runtime/library").JsonValue;
        widgetOverrides: import("generated/prisma/runtime/library").JsonValue;
        aiGenerated: boolean;
    }>;
}
