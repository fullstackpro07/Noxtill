import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { LocaleService } from '../common/localization/locale.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';

const DISCLAIMER = "This answer is based only on your own branch's data.";

const REFUSAL =
  "I can only answer questions about this branch's own sales, orders, and performance data.";

interface DailyCloseRow {
  close_date: Date;
  orders_count: bigint;
  revenue: string | null;
  gross_profit: string | null;
}

/**
 * Branch advisor (BE-060) — like AiService.whatIf, this is a standalone
 * ClaudeClient call ahead of the shared AI infra (BE-075). Deliberately
 * scoped to ONE business (the caller's own branch) via TenantPrismaService,
 * unlike RollupService which reads across the whole branch group — an
 * owner asking "how is this branch doing" should never see, or leak,
 * another branch's numbers into the answer.
 */
@Injectable()
export class BranchAdvisorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async ask(businessId: string, dto: BranchAdvisorDto) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const rows = await this.tenantPrisma.client.$queryRaw<DailyCloseRow[]>`
      SELECT close_date, orders_count, revenue, gross_profit
      FROM v_daily_close
      WHERE business_id = ${businessId} AND close_date >= now() - interval '30 days'
      ORDER BY close_date ASC
    `;

    const historyLines =
      rows.length > 0
        ? rows
            .map(
              (r) =>
                `${r.close_date.toISOString().slice(0, 10)}: ${r.orders_count} orders, ` +
                `${this.locale.formatCurrency(Number(r.revenue ?? 0), business)} revenue, ` +
                `${this.locale.formatCurrency(Number(r.gross_profit ?? 0), business)} gross profit`,
            )
            .join('\n')
        : 'No sales recorded in the last 30 days.';

    const prompt = [
      `You are a plain-language business advisor for the branch "${business.name}", speaking ONLY from the data below.`,
      `Last 30 days of daily performance:\n${historyLines}`,
      `The owner asks: "${dto.question}"`,
      "If this question is about this branch's own sales, orders, staffing, or performance, answer in 2-4 short sentences using ONLY the data above — never invent numbers.",
      `If the question is NOT about this branch's own performance (e.g. general business advice unrelated to the data, or asks about other businesses/branches), respond with exactly: "${REFUSAL}"`,
    ].join('\n\n');

    let answer: string;
    try {
      answer = await this.aiInfra.complete(businessId, prompt);
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { answer, disclaimer: DISCLAIMER };
  }
}
