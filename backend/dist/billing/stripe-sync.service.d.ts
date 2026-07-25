import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
export declare class StripeSyncService implements OnModuleInit {
    private readonly prisma;
    private readonly stripeAdapter;
    private readonly logger;
    constructor(prisma: PrismaService, stripeAdapter: StripeGatewayAdapter);
    onModuleInit(): Promise<void>;
}
