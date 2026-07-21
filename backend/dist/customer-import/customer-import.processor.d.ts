import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CustomerImportService } from './customer-import.service';
interface ExecuteJobData {
    businessId: string;
    batchId: string;
}
export declare class CustomerImportProcessor extends WorkerHost {
    private readonly importService;
    private readonly logger;
    constructor(importService: CustomerImportService);
    process(job: Job<ExecuteJobData>): Promise<void>;
}
export {};
