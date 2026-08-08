import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ExportsService } from './exports.service';
import { S3Service } from '../common/storage/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
interface AccountZipJobData {
    businessId: string;
    userId: string;
}
export declare class AccountZipProcessor extends WorkerHost {
    private readonly exportsService;
    private readonly s3;
    private readonly notifications;
    private readonly logger;
    constructor(exportsService: ExportsService, s3: S3Service, notifications: NotificationsService);
    process(job: Job<AccountZipJobData>): Promise<void>;
}
export {};
