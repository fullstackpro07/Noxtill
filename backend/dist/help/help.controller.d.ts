import { HelpService } from './help.service';
import { AskHelpDto } from './help.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class HelpController {
    private readonly helpService;
    constructor(helpService: HelpService);
    ask(user: AuthenticatedUser, dto: AskHelpDto): Promise<{
        answer: string;
        sources: {
            title: string;
            url: string;
        }[];
    }>;
}
