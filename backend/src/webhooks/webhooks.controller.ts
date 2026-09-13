import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WebhookIdempotencyService } from '../common/webhooks/webhook-idempotency.service';
import {
  verifyMetaSignature,
  verifyTwilioSignature,
  verifyTelnyxSignature,
  safeEqual,
} from '../common/webhooks/signature.util';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';

interface TelnyxWebhookBody {
  data?: {
    event_type?: string;
    id?: string;
    payload?: {
      id?: string;
      type?: string;
      from?: { phone_number?: string };
      to?: { phone_number?: string; status?: string }[];
      errors?: unknown[];
    };
  };
}

interface MetaWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id: string }>;
        messages?: Array<{ id: string }>;
      };
    }>;
  }>;
}

/**
 * Provider webhook endpoints (BE-019). Every handler follows the webhook rule
 * (spec §1): verify signature → idempotency-gate via (provider, event_id) →
 * enqueue processing → return 200. Nothing is processed inline here.
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly idempotency: WebhookIdempotencyService,
    private readonly config: ConfigService,
    @InjectQueue(WEBHOOK_EVENTS_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  /** Meta's subscription verification handshake. */
  @Public()
  @Get('meta')
  verifyMeta(@Query() query: Record<string, string>, @Res() res: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      token === this.config.get<string>('META_WA_VERIFY_TOKEN')
    ) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden');
  }

  @Public()
  @Post('meta')
  @HttpCode(200)
  async meta(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      throw new ServiceUnavailableException('Meta webhook is not configured');
    }
    if (
      !verifyMetaSignature(req.rawBody ?? Buffer.from(''), signature, appSecret)
    ) {
      throw new ForbiddenException('Invalid signature');
    }

    const body = req.body as MetaWebhookBody;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          await this.idempotency.handle('meta', status.id, async () => {
            await this.webhookQueue.add('meta-status', status, {
              jobId: `meta-status-${status.id}`,
            });
          });
        }
        for (const message of change.value?.messages ?? []) {
          await this.idempotency.handle('meta', message.id, async () => {
            await this.webhookQueue.add('meta-inbound', message, {
              jobId: `meta-inbound-${message.id}`,
            });
          });
        }
      }
    }

    return { received: true };
  }

  @Public()
  @Post('twilio')
  @HttpCode(200)
  async twilio(
    @Req() req: Request,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const body = req.body as Record<string, string>;

    if (!authToken) {
      throw new ServiceUnavailableException('Twilio webhook is not configured');
    }
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!verifyTwilioSignature(fullUrl, body, signature, authToken)) {
      throw new ForbiddenException('Invalid signature');
    }

    const eventId = body.MessageSid ?? body.SmsSid;
    if (eventId) {
      await this.idempotency.handle('twilio', eventId, async () => {
        await this.webhookQueue.add('twilio-status', body, {
          jobId: `twilio-status-${eventId}`,
        });
      });
    }

    return { received: true };
  }

  /**
   * Telnyx inbound messaging (SMS/MMS/WhatsApp — testing setup, see UPD-BE note: this stands in
   * for Twilio until the number moves back). Unlike Twilio's per-purpose webhooks, Telnyx posts
   * every message lifecycle event (inbound + outbound status) to this one URL, disambiguated by
   * `data.event_type`.
   */
  @Public()
  @Post('telnyx')
  @HttpCode(200)
  async telnyx(
    @Req() req: RawBodyRequest<Request>,
    @Headers('telnyx-signature-ed25519') signature?: string,
    @Headers('telnyx-timestamp') timestamp?: string,
  ) {
    const publicKey = this.config.get<string>('TELNYX_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.error(
        'Telnyx webhook hit but TELNYX_PUBLIC_KEY is not configured — rejecting with 503',
      );
      throw new ServiceUnavailableException('Telnyx webhook is not configured');
    }
    if (
      !verifyTelnyxSignature(
        req.rawBody ?? Buffer.from(''),
        timestamp,
        signature,
        publicKey,
      )
    ) {
      this.logger.warn('Telnyx webhook signature verification failed');
      throw new ForbiddenException('Invalid signature');
    }

    const body = req.body as TelnyxWebhookBody;
    const eventType = body.data?.event_type;
    const eventId = body.data?.id;
    const payload = body.data?.payload;
    this.logger.log(
      `Telnyx webhook accepted: event_type=${eventType} id=${eventId} from=${payload?.from?.phone_number}`,
    );
    if (!eventType || !eventId) {
      return { received: true };
    }

    if (eventType === 'message.received') {
      await this.idempotency.handle('telnyx', eventId, async () => {
        await this.webhookQueue.add(
          'telnyx-inbound',
          { type: payload?.type, from: payload?.from?.phone_number },
          { jobId: `telnyx-inbound-${eventId}` },
        );
      });
    } else if (
      eventType === 'message.sent' ||
      eventType === 'message.finalized'
    ) {
      await this.idempotency.handle('telnyx', eventId, async () => {
        await this.webhookQueue.add(
          'telnyx-status',
          {
            messageId: payload?.id,
            status: payload?.to?.[0]?.status,
            hasErrors: Boolean(payload?.errors?.length),
          },
          { jobId: `telnyx-status-${eventId}` },
        );
      });
    }

    return { received: true };
  }

  @Public()
  @Post('email')
  @HttpCode(200)
  async email(@Req() req: Request, @Query('token') token?: string) {
    const expected = this.config.get<string>('EMAIL_WEBHOOK_SECRET');
    if (!expected) {
      throw new ServiceUnavailableException('Email webhook is not configured');
    }
    if (!token || !safeEqual(token, expected)) {
      throw new ForbiddenException('Invalid webhook token');
    }

    const body = req.body as { type?: string; data?: { email_id?: string } };
    const emailId = body.data?.email_id;
    const eventId = emailId ? `${emailId}-${body.type ?? 'event'}` : undefined;
    if (eventId) {
      await this.idempotency.handle('email', eventId, async () => {
        await this.webhookQueue.add('email-event', body, {
          jobId: `email-event-${eventId}`,
        });
      });
    }

    return { received: true };
  }
}
