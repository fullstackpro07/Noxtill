import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
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
  safeEqual,
} from '../common/webhooks/signature.util';
import {
  META_FAMILY_PLATFORMS,
  SOCIAL_WEBHOOK_QUEUE,
} from './social.constants';

interface MetaFamilyWebhookBody {
  entry?: {
    id?: string;
    changes?: { value?: { comment_id?: string; message_id?: string } }[];
    messaging?: { message?: { mid?: string } }[];
  }[];
}

interface NormalizedWebhookBody {
  externalId?: string;
}

/**
 * Social Inbox webhook ingestion (UPD-BE-049) — follows the exact same real rule as
 * `WebhooksController` (spec §1): verify signature → idempotency-gate via (provider, event_id) →
 * enqueue → return 200, nothing processed inline. Full native Meta-envelope signature
 * verification + per-entry event-id extraction is real for facebook/instagram/threads (they
 * share one well-documented shape); the other 12 platforms verify via a shared per-platform token
 * and are expected to already be normalized — see `SOCIAL_WEBHOOK_QUEUE`'s processor for the
 * disclosed scope note on why full bespoke parsing for all 15 raw formats is out of this ticket.
 */
@Controller('webhooks/social')
export class SocialWebhookController {
  constructor(
    private readonly idempotency: WebhookIdempotencyService,
    private readonly config: ConfigService,
    @InjectQueue(SOCIAL_WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  /** Meta's subscription verification handshake — shared across facebook/instagram/threads. */
  @Public()
  @Get(':platform')
  verify(
    @Param('platform') platform: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expected = this.config.get<string>(
      `SOCIAL_${platform.toUpperCase()}_VERIFY_TOKEN`,
    );

    if (mode === 'subscribe' && expected && safeEqual(token ?? '', expected)) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden');
  }

  @Public()
  @Post(':platform')
  @HttpCode(200)
  async receive(
    @Param('platform') platform: string,
    @Req() req: RawBodyRequest<Request>,
    @Query('token') sharedToken?: string,
  ) {
    const isMetaFamily = (META_FAMILY_PLATFORMS as readonly string[]).includes(
      platform,
    );

    if (isMetaFamily) {
      const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET');
      if (!appSecret) {
        throw new ServiceUnavailableException(
          `${platform} webhook is not configured`,
        );
      }
      const signature = req.headers['x-hub-signature-256'] as
        string | undefined;
      if (
        !verifyMetaSignature(
          req.rawBody ?? Buffer.from(''),
          signature,
          appSecret,
        )
      ) {
        throw new ForbiddenException('Invalid signature');
      }

      const body = req.body as MetaFamilyWebhookBody;
      for (const entry of body.entry ?? []) {
        const eventIds = [
          ...(entry.changes ?? []).flatMap((c) =>
            [c.value?.comment_id, c.value?.message_id].filter(
              (id): id is string => Boolean(id),
            ),
          ),
          ...(entry.messaging ?? [])
            .map((m) => m.message?.mid)
            .filter((id): id is string => Boolean(id)),
        ];
        for (const eventId of eventIds) {
          await this.idempotency.handle(
            `social:${platform}`,
            eventId,
            async () => {
              await this.queue.add(
                'social-event',
                { platform, body },
                { jobId: `social-${platform}-${eventId}` },
              );
            },
          );
        }
      }
      return { received: true };
    }

    const expectedToken = this.config.get<string>(
      `SOCIAL_${platform.toUpperCase()}_VERIFY_TOKEN`,
    );
    if (!expectedToken) {
      throw new ServiceUnavailableException(
        `${platform} webhook is not configured`,
      );
    }
    if (!sharedToken || !safeEqual(sharedToken, expectedToken)) {
      throw new ForbiddenException('Invalid webhook token');
    }

    const body = req.body as NormalizedWebhookBody;
    const eventId = body.externalId;
    if (eventId) {
      await this.idempotency.handle(`social:${platform}`, eventId, async () => {
        await this.queue.add(
          'social-event',
          { platform, body },
          { jobId: `social-${platform}-${eventId}` },
        );
      });
    }
    return { received: true };
  }
}
