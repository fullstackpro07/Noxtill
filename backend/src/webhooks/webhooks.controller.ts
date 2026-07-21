import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
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
} from '../common/webhooks/signature.util';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';

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
    if (
      appSecret &&
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

    if (authToken) {
      const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      if (!verifyTwilioSignature(fullUrl, body, signature, authToken)) {
        throw new ForbiddenException('Invalid signature');
      }
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

  @Public()
  @Post('email')
  @HttpCode(200)
  async email(@Req() req: Request, @Query('token') token?: string) {
    const expected = this.config.get<string>('EMAIL_WEBHOOK_SECRET');
    if (expected && token !== expected) {
      throw new ForbiddenException('Invalid webhook token');
    }

    const body = req.body as { MessageID?: string; RecordType?: string };
    const eventId = body.MessageID
      ? `${body.MessageID}-${body.RecordType ?? 'event'}`
      : undefined;
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
