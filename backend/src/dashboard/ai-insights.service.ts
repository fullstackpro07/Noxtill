import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { LAPSED_DAYS } from '../customers/jobs/crm-jobs.constants';
import {
  CREDIT_NOTABLE_OVERDUE_DAYS,
  MARKETING_QUIET_DAYS,
  SALES_NOTABLE_DELTA_PERCENT,
} from './dashboard.constants';
import { AiInsightCategory } from '@prisma/client';

interface CategoryFact {
  category: AiInsightCategory;
  sourceFigure: string;
  /** Extra context for the AI prompt only — never stored, never itself trusted as the source figure. */
  context: string;
}

interface LowStockRow {
  id: string;
  name: string;
  stock_qty: number;
  low_stock_threshold: number;
}

interface DebtorRow {
  customer_id: string;
  name: string;
  balance: string;
  days_outstanding: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * AI Insights (UPD-BE-003): every figure quoted in an insight is computed deterministically in
 * `gatherFacts()` BEFORE any AI call — the model is only ever asked to phrase a natural-language
 * observation from a fact it's handed, never to produce or invent the figure itself. This mirrors
 * the "never fabricate" discipline already established by the branch advisor and AI assistant.
 */
@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async list(
    businessId: string,
    category?: AiInsightCategory,
    status?: string,
  ) {
    return this.tenantPrisma.client.aiInsight.findMany({
      where: {
        businessId,
        ...(category ? { category } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setStatus(
    businessId: string,
    id: string,
    status: 'actioned' | 'dismissed',
  ) {
    const insight = await this.tenantPrisma.client.aiInsight.findUnique({
      where: { id },
    });
    if (!insight || insight.businessId !== businessId) {
      throw new NotFoundException('Insight not found');
    }
    return this.tenantPrisma.client.aiInsight.update({
      where: { id },
      data: { status },
    });
  }

  /** Shared by the daily scheduled job and (later) a possible "refresh now" trigger. */
  async generateForBusiness(businessId: string): Promise<number> {
    const facts = await this.gatherFacts(businessId);
    if (facts.length === 0) return 0;

    let observations: string[];
    try {
      observations = await this.phraseObservations(businessId, facts);
    } catch (error) {
      if (error instanceof AppException) {
        this.logger.warn(
          `AI insight phrasing skipped for business ${businessId}: ${error.message}`,
        );
      } else {
        this.logger.warn(
          `AI insight phrasing failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
      // Graceful degradation: the source figure alone is still an honest, real insight —
      // just without AI-polished prose.
      observations = facts.map((f) => f.sourceFigure);
    }

    await this.tenantPrisma.client.aiInsight.createMany({
      data: facts.map((fact, i) => ({
        businessId,
        category: fact.category,
        sourceFigure: fact.sourceFigure,
        observation: observations[i] || fact.sourceFigure,
      })),
    });

    return facts.length;
  }

  private async phraseObservations(
    businessId: string,
    facts: CategoryFact[],
  ): Promise<string[]> {
    const factLines = facts
      .map(
        (f, i) => `${i + 1}. [${f.category}] ${f.sourceFigure} — ${f.context}`,
      )
      .join('\n');

    const prompt = [
      'You write one-sentence business insights from real figures a system has already computed.',
      'Here are the numbered facts:',
      factLines,
      'For each numbered fact, write exactly one short, plain-language sentence (max ~20 words)',
      'that states the observation and, where natural, a brief suggested action.',
      'Use ONLY the numbers already given — never introduce a new number, date, or figure of your own.',
      'Reply with ONLY a JSON array of strings, one per fact, in the same order. No other text.',
      'Example shape: ["Sentence for fact 1.", "Sentence for fact 2."]',
    ].join('\n');

    const raw = await this.aiInfra.complete(businessId, prompt);
    const parsed = this.parseObservationArray(raw, facts.length);
    if (!parsed) {
      throw new AppException(
        'AI_INSIGHT_PARSE_FAILED',
        'The AI response could not be parsed as insight text.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return parsed;
  }

  private parseObservationArray(
    raw: string,
    expectedLength: number,
  ): string[] | null {
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;

    try {
      const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (
        !Array.isArray(parsed) ||
        parsed.length !== expectedLength ||
        !parsed.every(
          (item) => typeof item === 'string' && item.trim().length > 0,
        )
      ) {
        return null;
      }
      return parsed as string[];
    } catch {
      return null;
    }
  }

  /** Each category returns null when there's nothing notable this run — never a fabricated insight. */
  async gatherFacts(businessId: string): Promise<CategoryFact[]> {
    const [sales, stock, customers, marketing, credit] = await Promise.all([
      this.salesFact(businessId),
      this.stockFact(businessId),
      this.customersFact(businessId),
      this.marketingFact(businessId),
      this.creditFact(businessId),
    ]);
    return [sales, stock, customers, marketing, credit].filter(
      (fact): fact is CategoryFact => fact !== null,
    );
  }

  private async salesFact(businessId: string): Promise<CategoryFact | null> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeek, lastWeek] = await Promise.all([
      this.tenantPrisma.client.order.aggregate({
        where: {
          businessId,
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: weekAgo },
        },
        _sum: { total: true },
      }),
      this.tenantPrisma.client.order.aggregate({
        where: {
          businessId,
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
        },
        _sum: { total: true },
      }),
    ]);

    const thisWeekTotal = round2(Number(thisWeek._sum.total ?? 0));
    const lastWeekTotal = round2(Number(lastWeek._sum.total ?? 0));
    if (thisWeekTotal === 0 && lastWeekTotal === 0) return null;

    const deltaPercent =
      lastWeekTotal > 0
        ? round2(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
        : thisWeekTotal > 0
          ? 100
          : 0;
    if (Math.abs(deltaPercent) < SALES_NOTABLE_DELTA_PERCENT) return null;

    const sign = deltaPercent >= 0 ? '+' : '';
    return {
      category: 'sales',
      sourceFigure: `Revenue: ${thisWeekTotal} this week vs ${lastWeekTotal} last week (${sign}${deltaPercent}%)`,
      context:
        deltaPercent >= 0
          ? 'this is a real increase'
          : 'this is a real decline',
    };
  }

  private async stockFact(businessId: string): Promise<CategoryFact | null> {
    const rows = await this.tenantPrisma.client.$queryRaw<LowStockRow[]>`
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC
      LIMIT 5
    `;
    if (rows.length === 0) return null;

    const names = rows.map((r) => `${r.name} (${r.stock_qty} left)`).join(', ');
    return {
      category: 'stock',
      sourceFigure: `${rows.length} product(s) at or below their reorder threshold: ${names}`,
      context: 'these need reordering soon to avoid stockouts',
    };
  }

  private async customersFact(
    businessId: string,
  ): Promise<CategoryFact | null> {
    const cutoff = new Date(Date.now() - LAPSED_DAYS * 24 * 60 * 60 * 1000);
    const lapsedCount = await this.tenantPrisma.client.customer.count({
      where: {
        businessId,
        visitCount: { gt: 0 },
        OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }],
      },
    });
    if (lapsedCount === 0) return null;

    return {
      category: 'customers',
      sourceFigure: `${lapsedCount} customer(s) haven't visited in ${LAPSED_DAYS}+ days`,
      context: 'a win-back message could bring some of them back',
    };
  }

  private async marketingFact(
    businessId: string,
  ): Promise<CategoryFact | null> {
    const cutoff = new Date(
      Date.now() - MARKETING_QUIET_DAYS * 24 * 60 * 60 * 1000,
    );
    const recentCampaign = await this.tenantPrisma.client.campaign.findFirst({
      where: { businessId, createdAt: { gte: cutoff } },
    });
    if (recentCampaign) return null;

    const hasAnyCustomers = await this.tenantPrisma.client.customer.count({
      where: { businessId },
    });
    if (hasAnyCustomers === 0) return null;

    return {
      category: 'marketing',
      sourceFigure: `No campaign sent in the last ${MARKETING_QUIET_DAYS} days`,
      context: 'a simple campaign to existing customers could re-engage them',
    };
  }

  private async creditFact(businessId: string): Promise<CategoryFact | null> {
    const rows = await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0 AND v.days_outstanding >= ${CREDIT_NOTABLE_OVERDUE_DAYS}
      ORDER BY v.days_outstanding DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;

    const [top] = rows;
    return {
      category: 'credit',
      sourceFigure: `${top.name} owes ${round2(Number(top.balance))}, ${top.days_outstanding} days overdue`,
      context: 'this is the most overdue outstanding balance right now',
    };
  }
}
