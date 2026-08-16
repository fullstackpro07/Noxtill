import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildLedgerRows } from './credit.types';

/**
 * Transparent ledger links (UPD-BE-022) — no auth, resolved entirely by the token, same shape as
 * `PublicReviewService`. Unlike review tokens this one has no fixed expiry (a customer should be
 * able to check their balance indefinitely); the owner revokes it explicitly instead.
 */
@Injectable()
export class PublicCreditService {
  constructor(private readonly prisma: PrismaService) {}

  async getByToken(token: string) {
    const link = await this.prisma.creditShareLink.findUnique({
      where: { token },
    });
    if (!link || link.revoked) {
      throw new NotFoundException('Link not found');
    }

    const [business, customer, entries] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: link.businessId },
      }),
      this.prisma.customer.findUniqueOrThrow({
        where: { id: link.customerId },
      }),
      this.prisma.creditEntry.findMany({
        where: { customerId: link.customerId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const rows = buildLedgerRows(entries);

    return {
      businessName: business.name,
      customerName: customer.name,
      balance: rows.length ? rows[rows.length - 1].runningBalance : 0,
      entries: rows,
    };
  }
}
