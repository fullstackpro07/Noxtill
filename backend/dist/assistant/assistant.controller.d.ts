import type { Response } from 'express';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AssistantController {
    private readonly assistantService;
    constructor(assistantService: AssistantService);
    tools(): {
        name: string;
        description: string;
    }[];
    chat(user: AuthenticatedUser, dto: AssistantChatDto, res: Response): Promise<void>;
}
