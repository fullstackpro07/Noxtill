import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type Stripe from 'stripe';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WebhookIdempotencyService } from '../common/webhooks/webhook-idempotency.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { STRIPE_WEBHOOK_QUEUE } from './stripe-webhook.constants';

/**
 * Stripe webhook (BE-065). `constructEvent` both verifies the signature AND
 * parses the payload in one call — unlike Meta/Twilio, there's no separate
 * verify-then-parse step. Same webhook rule as every other provider
 * (spec §1): idempotency-gate by event.id, enqueue, never process inline.
 */
@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly idempotency: WebhookIdempotencyService,
    private readonly stripeAdapter: StripeGatewayAdapter,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const stripe = this.stripeAdapter.stripe;
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!stripe || !webhookSecret) {
      throw new ServiceUnavailableException('Stripe billing is not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody ?? Buffer.from(''),
        signature ?? '',
        webhookSecret,
      );
    } catch {
      throw new ForbiddenException('Invalid Stripe signature');
    }

    await this.idempotency.handle('stripe', event.id, async () => {
      await this.queue.add(event.type, event.data.object, { jobId: event.id });
    });

    return { received: true };
  }
}
