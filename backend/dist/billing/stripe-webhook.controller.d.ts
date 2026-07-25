import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookIdempotencyService } from '../common/webhooks/webhook-idempotency.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
export declare class StripeWebhookController {
    private readonly config;
    private readonly idempotency;
    private readonly stripeAdapter;
    private readonly queue;
    constructor(config: ConfigService, idempotency: WebhookIdempotencyService, stripeAdapter: StripeGatewayAdapter, queue: Queue);
    stripe(req: RawBodyRequest<Request>, signature?: string): Promise<{
        received: boolean;
    }>;
}
