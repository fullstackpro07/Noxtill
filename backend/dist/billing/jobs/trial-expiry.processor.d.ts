import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanAssignmentService } from '../plan-assignment.service';
interface TrialExpiryJobData {
    now?: string;
}
export declare class TrialExpiryProcessor extends WorkerHost {
    private readonly prisma;
    private readonly planAssignment;
    private readonly logger;
    constructor(prisma: PrismaService, planAssignment: PlanAssignmentService);
    process(job: Job<TrialExpiryJobData>): Promise<void>;
    runExpiry(now?: Date): Promise<void>;
}
export {};
