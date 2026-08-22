import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ResendReceiptDto } from './dto/resend-receipt.dto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '@prisma/client';

@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('staffUserId') staffUserId?: string,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.receiptsService.list(
      user.businessId,
      user.role,
      callerBusinessUserId,
      {
        q,
        staffUserId,
      },
    );
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.receiptsService.stats(user.businessId);
  }

  @Post(':id/resend')
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResendReceiptDto,
  ) {
    return this.receiptsService.resend(user.businessId, id, dto.channel);
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
