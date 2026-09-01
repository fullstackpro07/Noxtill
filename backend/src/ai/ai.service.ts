import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { LocaleService } from '../common/localization/locale.service';
import { AiInfraService } from './ai-infra.service';
import { WhatIfDto } from './dto/what-if.dto';

const DISCLAIMER =
  'This is an AI-generated estimate based on your own sales history — not a guarantee.';

interface MonthlyHistoryRow {
  month: string;
  units: bigint;
  revenue: string;
}

@Injectable()
export class AiService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async whatIf(businessId: string, dto: WhatIfDto) {
    const [business, product] = await Promise.all([
      this.tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
      }),
      this.tenantPrisma.client.product.findUnique({
        where: { id: dto.productId },
      }),
    ]);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const history = await this.tenantPrisma.client.$queryRaw<
      MonthlyHistoryRow[]
    >`
      SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ${dto.productId}
        AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month
    `;

    if (history.length === 0) {
      return {
        estimate:
          'Not enough sales history for this product yet — check back after a few sales.',
        disclaimer: DISCLAIMER,
      };
    }

    const historyLines = history
      .map(
        (row) =>
          `${row.month}: ${row.units} units, ${this.locale.formatCurrency(Number(row.revenue), business)}`,
      )
      .join('\n');

    const prompt = [
      `You are a plain-language business assistant for a small business owner using ${business.currency} currency.`,
      `Product: "${product.name}", currently priced at ${this.locale.formatCurrency(Number(product.sellingPrice), business)}.`,
      `Monthly sales history (last 6 months):\n${historyLines}`,
      `The owner is considering a ${dto.priceDeltaPct > 0 ? '+' : ''}${dto.priceDeltaPct}% price change.`,
      'In 2-3 short sentences, estimate the likely impact on monthly revenue based ONLY on the history above. Be specific with a number where possible. Do not invent data not shown above.',
    ].join('\n\n');

    let estimate: string;
    try {
      estimate = await this.aiInfra.complete(businessId, prompt, 0, 'what_if');
    } catch (error) {
      if (error instanceof AppException) {
        throw error; // rate-limit / cost-cap errors from AiInfraService are already typed
      }
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { estimate, disclaimer: DISCLAIMER };
  }
}
