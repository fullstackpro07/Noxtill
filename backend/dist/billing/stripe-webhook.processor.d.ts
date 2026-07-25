import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PlanAssignmentService } from './plan-assignment.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
export declare class StripeWebhookProcessor extends WorkerHost {
    private readonly prisma;
    private readonly planAssignment;
    private readonly stripeAdapter;
    private readonly logger;
    constructor(prisma: PrismaService, planAssignment: PlanAssignmentService, stripeAdapter: StripeGatewayAdapter);
    process(job: Job): Promise<void>;
    private handleCheckoutCompleted;
    private handleSubscriptionUpdated;
    private handleSubscriptionDeleted;
}
