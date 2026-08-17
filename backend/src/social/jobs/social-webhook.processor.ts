import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SocialInboxService } from '../social-inbox.service';
import {
  META_FAMILY_PLATFORMS,
  SOCIAL_WEBHOOK_QUEUE,
} from '../social.constants';
import { SocialInboxFetchItem } from '../connectors/social-connector.interface';
import { SocialPlatform } from '../../../generated/prisma';

interface MetaFamilyEntry {
  id?: string;
  changes?: {
    value?: {
      comment_id?: string;
      post_id?: string;
      sender_name?: string;
      message?: string;
    };
  }[];
  messaging?: {
    sender?: { id?: string };
    message?: { mid?: string; text?: string };
    timestamp?: number;
  }[];
}

interface WebhookJobData {
  platform: SocialPlatform;
  body: {
    entry?: MetaFamilyEntry[];
    externalAccountId?: string;
    externalId?: string;
    kind?: 'comment' | 'dm';
    authorName?: string;
    text?: string;
    postExternalId?: string;
    receivedAt?: string;
  };
}

/**
 * Consumes `SOCIAL_WEBHOOK_QUEUE` (UPD-BE-049). Full real parsing of Meta's webhook envelope for
 * facebook/instagram/threads; for the other 12 platforms the job's `body` is expected to already
 * be normalized (`SocialWebhookController`'s disclosed scope simplification — see its doc
 * comment) and is passed straight to `SocialInboxService.ingest()`.
 */
@Processor(SOCIAL_WEBHOOK_QUEUE)
export class SocialWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialWebhookProcessor.name);

  constructor(private readonly inbox: SocialInboxService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { platform, body } = job.data;
    const isMetaFamily = (META_FAMILY_PLATFORMS as readonly string[]).includes(
      platform,
    );

    if (isMetaFamily) {
      for (const entry of body.entry ?? []) {
        const externalAccountId = entry.id;
        if (!externalAccountId) continue;

        for (const change of entry.changes ?? []) {
          const value = change.value;
          if (!value?.comment_id) continue;
          const item: SocialInboxFetchItem = {
            externalId: value.comment_id,
            kind: 'comment',
            authorName: value.sender_name,
            text: value.message ?? '',
            postExternalId: value.post_id,
            receivedAt: new Date().toISOString(),
          };
          await this.inbox
            .ingest(platform, externalAccountId, item)
            .catch((error: Error) =>
              this.logger.warn(
                `Social inbox ingest failed (${platform}): ${error.message}`,
              ),
            );
        }

        for (const message of entry.messaging ?? []) {
          if (!message.message?.mid) continue;
          const item: SocialInboxFetchItem = {
            externalId: message.message.mid,
            kind: 'dm',
            authorName: message.sender?.id,
            text: message.message.text ?? '',
            receivedAt: message.timestamp
              ? new Date(message.timestamp).toISOString()
              : new Date().toISOString(),
          };
          await this.inbox
            .ingest(platform, externalAccountId, item)
            .catch((error: Error) =>
              this.logger.warn(
                `Social inbox ingest failed (${platform}): ${error.message}`,
              ),
            );
        }
      }
      return;
    }

    if (!body.externalAccountId || !body.externalId || !body.kind || !body.text)
      return;
    const item: SocialInboxFetchItem = {
      externalId: body.externalId,
      kind: body.kind,
      authorName: body.authorName,
      text: body.text,
      postExternalId: body.postExternalId,
      receivedAt: body.receivedAt ?? new Date().toISOString(),
    };
    await this.inbox
      .ingest(platform, body.externalAccountId, item)
      .catch((error: Error) =>
        this.logger.warn(
          `Social inbox ingest failed (${platform}): ${error.message}`,
        ),
      );
  }
}
