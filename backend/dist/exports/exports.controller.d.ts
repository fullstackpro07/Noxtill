import { ExportsService } from './exports.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ExportsController {
    private readonly exports;
    constructor(exports: ExportsService);
    generate(user: AuthenticatedUser, kind: string): Promise<{
        url: string;
    }>;
    accountZip(user: AuthenticatedUser): Promise<{
        queued: true;
    }>;
}
