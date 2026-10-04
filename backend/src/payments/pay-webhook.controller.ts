import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PayApplyService } from './pay-apply.service';
import { SEvent } from './pay-stripe.service';
import { verifyStripeSignature } from './providers/stripe.transport';

/**
 * Stripe Connect webhooks for merchants' own accounts (Payments & Billing). Separate from
 * /webhooks/stripe, which stays for Noxtill's platform billing. The signature is checked against
 * the endpoint secret for the event's mode before anything is parsed or stored; events are routed
 * to a business by the connected account id and deduplicated on the event id.
 */
@Controller('webhooks')
export class PayWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly apply: PayApplyService,
  ) {}

  @Public()
  @Post('stripe-connect')
  @HttpCode(200)
  async connect(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from('');
    const live = this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET');
    const test = this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET_TEST');
    if (!live && !test)
      throw new ServiceUnavailableException(
        'Stripe Connect webhooks are not configured',
      );
    const ok =
      (live && verifyStripeSignature(raw, sig ?? '', live)) ||
      (test && verifyStripeSignature(raw, sig ?? '', test));
    if (!ok) throw new ForbiddenException('Invalid Stripe signature');
    const event = JSON.parse(raw.toString('utf8')) as SEvent;
    const res = await this.apply.handleEvent(event, 'Verified');
    return { received: true, processing: res.processing };
  }
}
