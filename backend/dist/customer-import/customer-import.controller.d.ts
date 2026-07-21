import { CustomerImportService } from './customer-import.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CustomerImportController {
    private readonly importService;
    constructor(importService: CustomerImportService);
    stage(user: AuthenticatedUser, file?: Express.Multer.File): Promise<import("./customer-import.types").ImportPreview>;
    getBatch(batchId: string): Promise<import("./customer-import.types").ImportPreview>;
    confirm(user: AuthenticatedUser, batchId: string): Promise<{
        batchId: string;
        status: string;
    }>;
}
