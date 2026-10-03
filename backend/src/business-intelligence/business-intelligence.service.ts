import { Injectable } from '@nestjs/common';
import { AiInsightCategory } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WidgetsService } from '../widgets/widgets.service';

const OVERVIEW_WIDGETS = [
  'revenue_today',
  'orders_today',
  'revenue_this_month',
  'low_stock_count',
  'new_customers_month',
] as const;

const INSIGHT_DESTINATIONS: Partial<Record<AiInsightCategory, string>> = {
  sales: '/profit',
  stock: '/inventory',
  customers: '/customers',
  marketing: '/marketing',
  credit: '/credit',
};

@Injectable()
export class BusinessIntelligenceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly widgets: WidgetsService,
  ) {}

  /**
   * Decision cockpit composed from the existing Dashboard widget definitions and the
   * canonical AI Insights records. BI deliberately stores no duplicate KPI values.
   */
  async overview(businessId: string) {
    const [metrics, insights, business] = await Promise.all([
      Promise.all(
        OVERVIEW_WIDGETS.map(async (key) => {
          const definition = this.widgets
            .listRegistry()
            .find((widget) => widget.key === key);
          return {
            key,
            title: definition?.title ?? key,
            value: await this.widgets.getWidgetData(key),
          };
        }),
      ),
      this.tenantPrisma.client.aiInsight.findMany({
        where: { businessId, status: 'new' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          category: true,
          observation: true,
          sourceFigure: true,
          estimatedImpact: true,
          status: true,
          createdAt: true,
        },
      }),
      this.tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { currency: true },
      }),
    ]);

    return {
      requestedAt: new Date().toISOString(),
      metricSource: 'Dashboard widget registry',
      currency: business.currency,
      metrics,
      insightSource: 'AI Insights',
      insights: insights.map((insight) => ({
        ...insight,
        estimatedImpact:
          insight.estimatedImpact === null
            ? null
            : Number(insight.estimatedImpact),
        nextDecisionHref: INSIGHT_DESTINATIONS[insight.category] ?? null,
      })),
      disclosure:
        'KPIs use the existing Dashboard definitions. BI reads the source modules and does not store a second copy. No insight is shown unless it exists in AI Insights. Dashboard metric values use the existing cache and may be up to 60 seconds old.',
    };
  }
}
