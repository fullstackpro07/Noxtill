import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Shared idempotency gate for every provider webhook (BE-011 / spec §1
 * webhook rule): insert (provider, event_id) first; on conflict, the event
 * has already been seen — return 200 and stop. Only a first-seen event goes
 * on to be enqueued. Processing itself must never happen inline here.
 */
@Injectable()
export class WebhookIdempotencyService {
  private readonly logger = new Logger(WebhookIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Returns true the first time (provider, eventId) is seen; false on any repeat. */
  async claim(provider: string, eventId: string): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId } });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Claims the event and, only if new, runs `enqueue` (which must do nothing
   * but push a job — never process the webhook body synchronously). Always
   * resolves; callers should respond 200 regardless of the return value.
   */
  async handle(
    provider: string,
    eventId: string,
    enqueue: () => Promise<void>,
  ): Promise<{ duplicate: boolean }> {
    const isNew = await this.claim(provider, eventId);
    if (!isNew) {
      this.logger.debug(
        `Duplicate webhook event ignored: ${provider}/${eventId}`,
      );
      return { duplicate: true };
    }
    await enqueue();
    return { duplicate: false };
  }
}
