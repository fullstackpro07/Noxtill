import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InvoicesService, type InvoiceStatus } from './invoices.service';
import { RecordInvoicePaymentDto } from './dto/record-invoice-payment.dto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '@prisma/client';

/** Invoices, formalized (UPD-BE-085) — derived paid/unpaid/overdue view over real completed orders. */
@Controller('orders/invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('staffUserId') staffUserId?: string,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.invoicesService.list(
      user.businessId,
      user.role,
      callerBusinessUserId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        status,
        staffUserId,
      },
    );
  }

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.invoicesService.summary(
      user.businessId,
      user.role,
      callerBusinessUserId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
    );
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordInvoicePaymentDto,
  ) {
    return this.invoicesService.recordPayment(user.businessId, id, dto);
  }

  @Post('remind-all')
  async remindAll(@CurrentUser() user: AuthenticatedUser) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.invoicesService.remindAll(
      user.businessId,
      user.role,
      callerBusinessUserId,
    );
  }

  private async resolveBusinessUserId(
    user: AuthenticatedUser,
  ): Promise<string | null> {
    if (user.role !== Role.staff) return null;
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: {
          businessId_userId: { businessId: user.businessId, userId: user.sub },
        },
        select: { id: true },
      },
    );
    return businessUser?.id ?? null;
  }
}
