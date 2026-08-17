import { TerminologyService } from './terminology.service';
import { SetLabelsDto } from './dto/set-labels.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class TerminologyController {
    private readonly terminology;
    constructor(terminology: TerminologyService);
    getAll(user: AuthenticatedUser): Promise<Record<string, Record<string, string>>>;
    setMany(user: AuthenticatedUser, dto: SetLabelsDto): Promise<Record<string, Record<string, string>>>;
}
