import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AskHelpDto } from './help.dto';
export declare const HELP_NOT_FOUND_MESSAGE = "I couldn't find anything about that in the help docs \u2014 try rephrasing, or contact support.";
export declare class HelpService {
    private readonly prisma;
    private readonly aiInfra;
    constructor(prisma: PrismaService, aiInfra: AiInfraService);
    ask(businessId: string | undefined, dto: AskHelpDto): Promise<{
        answer: string;
        sources: {
            title: string;
            url: string;
        }[];
    }>;
    private retrieve;
}
