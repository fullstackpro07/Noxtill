import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeClient, CreateMessageParams, CreateMessageResult } from './claude.client';
export declare class AiInfraService {
    private readonly prisma;
    private readonly claude;
    private readonly config;
    constructor(prisma: PrismaService, claude: ClaudeClient, config: ConfigService);
    complete(businessId: string | undefined, prompt: string, temperature?: number): Promise<string>;
    generateImage(businessId: string | undefined, prompt: string): Promise<{
        url: string;
    }>;
    createMessage(businessId: string | undefined, kind: string, params: CreateMessageParams, toolCalls?: unknown): Promise<CreateMessageResult>;
    checkGuardrails(businessId: string | undefined): Promise<void>;
    recordUsage(businessId: string | undefined, kind: string, result: CreateMessageResult, toolCalls?: unknown): Promise<void>;
    private enforceRateLimit;
    private enforceCostCap;
    private logCall;
}
