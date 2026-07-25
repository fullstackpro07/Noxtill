import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ClaudeClient } from '../ai/claude.client';
import { AiInfraService } from '../ai/ai-infra.service';
export interface AssistantChatResult {
    text: string;
    toolCalls: {
        name: string;
        input: unknown;
        output: unknown;
    }[];
}
export declare class AssistantService {
    private readonly tenantPrisma;
    private readonly claude;
    private readonly aiInfra;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, claude: ClaudeClient, aiInfra: AiInfraService);
    chat(businessId: string, message: string, onTextDelta?: (text: string) => void): Promise<AssistantChatResult>;
    private executeTool;
    listTools(): {
        name: string;
        description: string;
    }[];
}
