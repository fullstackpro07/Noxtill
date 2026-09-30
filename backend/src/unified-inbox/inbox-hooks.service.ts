import { Injectable, Logger } from '@nestjs/common';
import { InboxConversation, InboxMessage } from '@prisma/client';

export interface InboxHookEvent {
  conversation: InboxConversation;
  message: InboxMessage;
  /** True for mirrored history (social backfill) — listeners should not alert on it. */
  backfill?: boolean;
}

type Listener = (e: InboxHookEvent) => Promise<void>;

/**
 * Lets other modules follow what happens in the inbox without the inbox depending on them:
 * Helpdesk mirrors customer messages (and replies sent from the inbox) onto linked tickets.
 * A failing listener is logged and never breaks message intake or sending.
 */
@Injectable()
export class InboxHooksService {
  private readonly logger = new Logger(InboxHooksService.name);
  private readonly inbound: Listener[] = [];
  private readonly outbound: Listener[] = [];

  onInbound(fn: Listener) {
    this.inbound.push(fn);
  }

  onOutbound(fn: Listener) {
    this.outbound.push(fn);
  }

  async emitInbound(e: InboxHookEvent) {
    for (const fn of this.inbound) {
      try {
        await fn(e);
      } catch (err) {
        this.logger.warn(`inbound listener failed: ${(err as Error).message}`);
      }
    }
  }

  async emitOutbound(e: InboxHookEvent) {
    for (const fn of this.outbound) {
      try {
        await fn(e);
      } catch (err) {
        this.logger.warn(`outbound listener failed: ${(err as Error).message}`);
      }
    }
  }
}
