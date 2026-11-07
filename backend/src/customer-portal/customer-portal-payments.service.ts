import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayRequestsService } from '../payments/pay-requests.service';
import { REQUEST_OPEN } from '../payments/payments.constants';
import { CustomerPortalPaginationDto } from './customer-portal.dto';
import { CustomerPortalService } from './customer-portal.service';

/**
 * Customer Portal "Quotes & payments": online payment runs through Payments & Billing. Staff create
 * a payment request (Payments › Requests) for an order or invoice; the portal lists the signed-in
 * customer's open requests and links each to Payments' own /pay/<token> checkout. Payments alone
 * decides when a request is paid (provider webhook or a recorded payment), never this screen.
 */
@Injectable()
export class CustomerPortalPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: CustomerPortalService,
    private readonly requests: PayRequestsService,
  ) {}

  async billing(
    authorization: string | undefined,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const billing = await this.portal.getBilling(authorization, pagination);
    const identity = await this.portal.requireIdentity(
      authorization,
      'billing',
    );
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: identity.businessId },
      select: { id: true, parentId: true },
    });
    const rows = await this.prisma.payRequest.findMany({
      where: {
        businessId: b.parentId ?? b.id,
        customerId: identity.customerId,
        status: { in: REQUEST_OPEN },
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    const paymentRequests = rows.map((r) => ({
      number: r.number,
      description: r.description,
      status: r.status,
      currency: r.currency,
      amount: r.amountType === 'Fixed' && r.amount ? Number(r.amount) : null,
      amountPaid: Number(r.amountPaid),
      allowPartial: r.allowPartial,
      dueOn: r.dueOn?.toISOString().slice(0, 10) ?? null,
      expiresAt: r.expiresAt.toISOString(),
      linkType: r.linkType,
      linkId: r.linkId,
      testMode: r.env === 'test',
      payUrl: this.requests.url(r),
    }));
    // Newest open request per order or invoice.
    const payUrlByOrder = new Map<string, string>();
    for (const r of paymentRequests)
      if (
        r.linkId &&
        (r.linkType === 'Order' || r.linkType === 'Invoice') &&
        !payUrlByOrder.has(r.linkId)
      )
        payUrlByOrder.set(r.linkId, r.payUrl);
    const withPayUrl = <T extends { id: string }>(order: T) => ({
      ...order,
      payUrl: payUrlByOrder.get(order.id) ?? null,
    });
    return {
      ...billing,
      quotes: billing.quotes.map(withPayUrl),
      ordersAndReceipts: billing.ordersAndReceipts.map(withPayUrl),
      paymentRequests,
      onlineInvoicePayment: {
        available: true,
        reason: paymentRequests.length
          ? `${paymentRequests.length} payment request${paymentRequests.length === 1 ? '' : 's'} ready to pay online.`
          : 'Nothing to pay online right now. When the business sends you a payment request, it appears here.',
      },
    };
  }
}
