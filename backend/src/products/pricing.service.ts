import {
  HttpStatus,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { BulkPriceDto } from './dto/bulk-price.dto';
import {
  LOW_MARGIN_RATE,
  PRICING_ERROR_CODES,
  TARGET_MARGIN_RATE,
} from './pricing.constants';
import { Prisma } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Bulk pricing tools + price-history log + AI-phrased price suggestion (UPD-BE-015). */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly aiInfra: AiInfraService,
  ) {}

  /** Always returns the preview; only writes (price update + history) when `dryRun` is falsy. */
  async bulkPrice(dto: BulkPriceDto) {
    const where: Prisma.ProductWhereInput = { active: true };
    if (dto.productIds) where.id = { in: dto.productIds };
    if (dto.category) where.category = dto.category;

    const products = await this.tenantPrisma.client.product.findMany({
      where,
    });
    if (products.length === 0) {
      throw new AppException(
        PRICING_ERROR_CODES.NO_MATCHING_PRODUCTS,
        'No products matched the given filter',
        HttpStatus.BAD_REQUEST,
      );
    }

    const preview = products.map((product) => {
      const oldPrice = Number(product.sellingPrice);
      const rawNewPrice =
        dto.mode === 'percent'
          ? oldPrice * (1 + dto.value / 100)
          : oldPrice + dto.value;
      return {
        productId: product.id,
        name: product.name,
        oldPrice,
        newPrice: round2(Math.max(0, rawNewPrice)),
      };
    });

    if (dto.dryRun) {
      return { dryRun: true, changes: preview };
    }

    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.tenantPrisma.client.$transaction([
      ...preview.map((p) =>
        this.tenantPrisma.client.product.update({
          where: { id: p.productId },
          data: { sellingPrice: p.newPrice },
        }),
      ),
      ...preview.map((p) =>
        this.tenantPrisma.client.priceHistory.create({
          data: {
            productId: p.productId,
            oldPrice: p.oldPrice,
            newPrice: p.newPrice,
            changedByUserId: actorUserId,
            note: `Bulk ${dto.mode} change of ${dto.value}`,
          } as Prisma.PriceHistoryUncheckedCreateInput,
        }),
      ),
    ]);

    return { dryRun: false, changes: preview };
  }

  priceHistory(productId: string) {
    return this.tenantPrisma.client.priceHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * AI suggested-price. The suggested number itself is a deterministic formula grounded in real
   * sales data (never AI-invented — see `TARGET_MARGIN_RATE`); the AI is only asked to phrase a
   * one-sentence rationale citing the real figures already computed, same pattern as
   * `ProfitService.bundleSuggestions`. Falls back to the plain figures if the AI call fails.
   */
  async suggestedPrice(businessId: string, productId: string) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const costPrice = Number(product.costPrice);
    const sellingPrice = Number(product.sellingPrice);
    const currentMargin =
      sellingPrice > 0 ? (sellingPrice - costPrice) / sellingPrice : 0;

    const underpriced = currentMargin < LOW_MARGIN_RATE && costPrice > 0;
    const suggestedPrice = underpriced
      ? round2(costPrice / (1 - TARGET_MARGIN_RATE))
      : sellingPrice;

    const fallbackRationale = underpriced
      ? `Current margin is ${round2(currentMargin * 100)}%, below a healthy ${TARGET_MARGIN_RATE * 100}% target — consider raising the price.`
      : `Current margin is ${round2(currentMargin * 100)}%, already healthy — no change suggested.`;

    const result = {
      productId,
      costPrice,
      currentPrice: sellingPrice,
      currentMarginPercent: round2(currentMargin * 100),
      suggestedPrice,
      rationale: fallbackRationale,
    };

    try {
      result.rationale = await this.phraseRationale(businessId, result);
    } catch (error) {
      this.logger.warn(
        `Price-suggestion phrasing skipped for product ${productId}: ${(error as Error).message}`,
      );
    }
    return result;
  }

  private async phraseRationale(
    businessId: string,
    facts: {
      currentPrice: number;
      currentMarginPercent: number;
      suggestedPrice: number;
    },
  ): Promise<string> {
    const prompt = [
      'You write one-sentence pricing rationales from real numbers a system has already computed.',
      `Current price: ${facts.currentPrice}. Current margin: ${facts.currentMarginPercent}%. Suggested price: ${facts.suggestedPrice}.`,
      'Write exactly one short, plain-language sentence (max ~25 words) explaining the suggestion.',
      'Use ONLY the numbers already given — never introduce a new number of your own.',
      'Reply with ONLY the sentence text. No quotes, no other text.',
    ].join('\n');

    const raw = (await this.aiInfra.complete(businessId, prompt)).trim();
    if (!raw) {
      throw new Error('Empty AI response');
    }
    return raw;
  }
}
