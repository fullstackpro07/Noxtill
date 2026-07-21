import { AiService } from './ai.service';
import { WhatIfDto } from './dto/what-if.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    whatIf(user: AuthenticatedUser, dto: WhatIfDto): Promise<{
        estimate: string;
        disclaimer: string;
    }>;
}
