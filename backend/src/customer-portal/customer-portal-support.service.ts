import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskContextService } from '../helpdesk/helpdesk-context.service';
import { HelpdeskTicketsService } from '../helpdesk/helpdesk-tickets.service';
import { isOpenStatus } from '../helpdesk/helpdesk.constants';
import { PortalRequestDto } from '../helpdesk/dto/helpdesk.dto';
import { CustomerPortalService } from './customer-portal.service';

/**
 * Customer Portal "Support & messages": a signed-in customer's support requests are real Helpdesk
 * tickets (channel "Portal"), so routing, SLA, assignment and agent notifications all run through
 * Helpdesk. Helpdesk is keyed by the group root; the conversation itself (replies, attachments,
 * rating) stays on Helpdesk's own customer ticket page at /support/t/<portalToken>.
 */
@Injectable()
export class CustomerPortalSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: CustomerPortalService,
    private readonly tickets: HelpdeskTicketsService,
    private readonly helpdesk: HelpdeskContextService,
  ) {}

  private async rootOf(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    return b.parentId ?? b.id;
  }

  async list(authorization?: string) {
    const identity = await this.portal.requireIdentity(
      authorization,
      'support',
    );
    const rootId = await this.rootOf(identity.businessId);
    const [cfg, rows] = await Promise.all([
      this.helpdesk.config(rootId),
      this.prisma.helpdeskTicket.findMany({
        where: {
          businessId: rootId,
          customerId: identity.customerId,
          mergedIntoId: null,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
    ]);
    return {
      available: true,
      categories: cfg.categories,
      tickets: rows.map((t) => ({
        number: t.number,
        subject: t.subject,
        status: t.status,
        open: isOpenStatus(t.status),
        createdAt: t.createdAt.toISOString(),
        lastActivityAt: t.lastActivityAt.toISOString(),
        url: `/support/t/${t.portalToken}`,
      })),
    };
  }

  async create(authorization: string | undefined, dto: PortalRequestDto) {
    const identity = await this.portal.requireIdentity(
      authorization,
      'support',
    );
    const rootId = await this.rootOf(identity.businessId);
    const cfg = await this.helpdesk.config(rootId);
    const t = await this.tickets.create(null, rootId, {
      customerId: identity.customerId,
      subject: dto.subject,
      description: dto.description,
      channel: 'Portal',
      category:
        dto.category && cfg.categories.includes(dto.category)
          ? dto.category
          : cfg.categories[0],
      priority: cfg.general.defaultPriority,
      branchId: identity.businessId,
      origin: 'Ticket created from the customer portal',
    });
    await this.portal.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'support_requested',
      'HelpdeskTicket',
      t.id,
    );
    return {
      number: t.number,
      subject: t.subject,
      status: t.status,
      url: `/support/t/${t.portalToken}`,
    };
  }
}
