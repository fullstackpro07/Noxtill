import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { ProfitService } from '../profit/profit.service';
import { CommissionsService } from '../staff/commissions.service';
import { SendGateService } from '../messaging/send-gate.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OrderStatus, Role } from '@prisma/client';
import {
  ReportKind,
  REPORT_LABELS,
  currentMonth,
  monthBounds,
  round2,
} from './reports.types';

interface BusinessInfo {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly s3: S3Service,
    private readonly pdfRenderer: PdfRendererService,
    private readonly profitService: ProfitService,
    private readonly commissionsService: CommissionsService,
    private readonly sendGate: SendGateService,
  ) {}

  async generate(
    kind: ReportKind,
    month: string | undefined,
    authUser: AuthenticatedUser,
  ): Promise<{ url: string }> {
    const resolvedMonth = month ?? currentMonth();
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: authUser.businessId },
    });
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: {
          businessId_userId: {
            businessId: authUser.businessId,
            userId: authUser.sub,
          },
        },
      },
    );

    const bodyHtml = await this.buildBody(
      kind,
      resolvedMonth,
      business,
      authUser.role,
      businessUser?.id,
      authUser.businessId,
    );
    const html = this.renderHtml(REPORT_LABELS[kind], business, bodyHtml);
    const pdf = await this.pdfRenderer.renderPdf(html);

    const key = `reports/${authUser.businessId}/${kind}-${resolvedMonth}.pdf`;
    const url = await this.s3.uploadAndSign(key, pdf, 'application/pdf');

    return { url };
  }

  async send(
    kind: ReportKind,
    month: string | undefined,
    authUser: AuthenticatedUser,
  ) {
    const { url } = await this.generate(kind, month, authUser);

    const user = await this.tenantPrisma.client.user.findUniqueOrThrow({
      where: { id: authUser.sub },
    });

    return this.sendGate.send({
      businessId: authUser.businessId,
      templateKey: 'report_ready',
      to: { phone: user.phone ?? undefined, email: user.email ?? undefined },
      variables: { reportLabel: REPORT_LABELS[kind], url },
    });
  }

  private async buildBody(
    kind: ReportKind,
    month: string,
    business: BusinessInfo,
    role: Role,
    businessUserId: string | undefined,
    businessId: string,
  ): Promise<string> {
    switch (kind) {
      case 'monthly':
        return this.buildMonthly(month, business);
      case 'pnl':
        return this.buildPnl(businessId, month, business);
      case 'sales':
        return this.buildSales(month, business, role, businessUserId);
      case 'staff':
        if (role === Role.staff) {
          throw new AppException(
            'REPORT_FORBIDDEN',
            'Staff performance reports are only available to owners and managers.',
            HttpStatus.FORBIDDEN,
          );
        }
        return this.buildStaff(month);
      case 'reviews':
        return this.buildReviews(month);
    }
  }

  private async buildMonthly(
    month: string,
    business: BusinessInfo,
  ): Promise<string> {
    const { start, end } = monthBounds(month);
    const [orderAgg, reviewAgg] = await Promise.all([
      this.tenantPrisma.client.order.aggregate({
        where: {
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: start, lt: end },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.tenantPrisma.client.externalReview.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _avg: { stars: true },
      }),
    ]);

    const revenue = round2(Number(orderAgg._sum.total ?? 0));
    const orders = orderAgg._count;
    const avgRating = reviewAgg._avg.stars
      ? round2(Number(reviewAgg._avg.stars))
      : null;

    return `
      <h2>${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Revenue</td><td style="text-align:right">${this.locale.formatCurrency(revenue, business)}</td></tr>
        <tr><td>Orders</td><td style="text-align:right">${orders}</td></tr>
        <tr><td>Average rating</td><td style="text-align:right">${avgRating ?? '—'}</td></tr>
      </table>
    `;
  }

  private async buildPnl(
    businessId: string,
    month: string,
    business: BusinessInfo,
  ): Promise<string> {
    const pnl = await this.profitService.pnl(businessId, month);

    const expenseRows = pnl.expenses
      .map(
        (row: { category: string; amount: number }) => `
        <tr><td>${row.category}</td><td style="text-align:right">${this.locale.formatCurrency(row.amount, business)}</td></tr>`,
      )
      .join('');

    return `
      <h2>Profit &amp; loss — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Revenue</td><td style="text-align:right">${this.locale.formatCurrency(pnl.revenue, business)}</td></tr>
        <tr><td>COGS</td><td style="text-align:right">-${this.locale.formatCurrency(pnl.cogs, business)}</td></tr>
        <tr><th colspan="2" style="text-align:left; padding-top:12px;">Expenses</th></tr>
        ${expenseRows}
        <tr><th style="border-top:2px solid #D8D0BF;">Net profit</th><th style="text-align:right; border-top:2px solid #D8D0BF;">${this.locale.formatCurrency(pnl.netProfit, business)}</th></tr>
      </table>
    `;
  }

  private async buildSales(
    month: string,
    business: BusinessInfo,
    role: Role,
    businessUserId: string | undefined,
  ): Promise<string> {
    const { start, end } = monthBounds(month);
    const orders = await this.tenantPrisma.client.order.findMany({
      where: {
        status: OrderStatus.completed,
        isQuotation: false,
        createdAt: { gte: start, lt: end },
        ...(role === Role.staff ? { staffUserId: businessUserId } : {}),
      },
      include: { customer: true },
      orderBy: { createdAt: 'asc' },
    });

    const rows = orders
      .map(
        (o) => `
        <tr>
          <td>#${o.orderNo}</td>
          <td>${this.locale.formatDate(o.createdAt, business)}</td>
          <td>${o.customer?.name ?? 'Walk-in'}</td>
          <td style="text-align:right">${this.locale.formatCurrency(Number(o.total), business)}</td>
        </tr>`,
      )
      .join('');

    return `
      <h2>Sales — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No orders this month.</td></tr>'}</tbody>
      </table>
    `;
  }

  private async buildStaff(month: string): Promise<string> {
    const report = await this.commissionsService.report(month);

    const rows = report
      .map(
        (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.role}</td>
          <td style="text-align:right">${r.totalSales}</td>
          <td style="text-align:right">${r.commission}</td>
        </tr>`,
      )
      .join('');

    return `
      <h2>Staff performance — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>Name</th><th>Role</th><th style="text-align:right">Sales</th><th style="text-align:right">Commission</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No staff found.</td></tr>'}</tbody>
      </table>
    `;
  }

  private async buildReviews(month: string): Promise<string> {
    const { start, end } = monthBounds(month);
    const [reviewAgg, requestsTotal, requestsResponded] = await Promise.all([
      this.tenantPrisma.client.externalReview.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _avg: { stars: true },
        _count: true,
      }),
      this.tenantPrisma.client.reviewRequest.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.tenantPrisma.client.reviewRequest.count({
        where: {
          createdAt: { gte: start, lt: end },
          respondedAt: { not: null },
        },
      }),
    ]);

    const avgRating = reviewAgg._avg.stars
      ? round2(Number(reviewAgg._avg.stars))
      : null;
    const responseRate =
      requestsTotal > 0 ? round2((requestsResponded / requestsTotal) * 100) : 0;

    return `
      <h2>Reviews — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Reviews received</td><td style="text-align:right">${reviewAgg._count}</td></tr>
        <tr><td>Average rating</td><td style="text-align:right">${avgRating ?? '—'}</td></tr>
        <tr><td>Review requests sent</td><td style="text-align:right">${requestsTotal}</td></tr>
        <tr><td>Response rate</td><td style="text-align:right">${responseRate}%</td></tr>
      </table>
    `;
  }

  private renderHtml(
    title: string,
    business: BusinessInfo,
    bodyHtml: string,
  ): string {
    return `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <div style="background:#0C4B3B; color:#fff; padding:24px;">
            <h1 style="margin:0;">${business.name}</h1>
            <p style="margin:4px 0 0;">${title}</p>
          </div>
          <div style="padding:24px;">${bodyHtml}</div>
        </body>
      </html>
    `;
  }
}
