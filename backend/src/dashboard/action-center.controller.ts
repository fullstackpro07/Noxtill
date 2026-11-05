import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ActionCenterService } from './action-center.service';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ActionItemPriority, ActionItemType, Role } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { RejectProcurementActionDto } from './dto/reject-procurement-action.dto';

@Controller('actions')
export class ActionCenterController {
  constructor(
    private readonly actionCenterService: ActionCenterService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('priority') priority?: ActionItemPriority,
    @Query('type') type?: ActionItemType,
  ) {
    const businessUserId = await this.resolveBusinessUserId(user);
    return this.actionCenterService.list(
      user.businessId,
      user.role,
      businessUserId,
      {
        priority,
        type,
      },
      user.sub,
    );
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actionCenterService.complete(user.businessId, id);
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actionCenterService.dismiss(user.businessId, id);
  }

  @Post(':id/snooze')
  snooze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SnoozeActionItemDto,
  ) {
    return this.actionCenterService.snooze(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Post(':id/approve')
  approveProcurementRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.actionCenterService.approveProcurementRequestAction(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Post(':id/reject')
  rejectProcurementRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.rejectProcurementRequestAction(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Post(':id/approve-inventory-transfer')
  approveInventoryAgentTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.actionCenterService.approveInventoryAgentTransferAction(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Post(':id/reject-inventory-transfer')
  rejectInventoryAgentTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.rejectInventoryAgentTransferAction(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/approve-finance-journal')
  approveFinanceJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.approveFinanceJournalAction(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/reject-finance-journal')
  rejectFinanceJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.rejectFinanceJournalAction(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post(':id/approve-seo-content')
  approveSeoAgentContentBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.decideSeoAgentContentBriefAction(
      user.businessId,
      user.sub,
      id,
      'approve',
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post(':id/send-back-seo-content')
  sendBackSeoAgentContentBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProcurementActionDto,
  ) {
    return this.actionCenterService.decideSeoAgentContentBriefAction(
      user.businessId,
      user.sub,
      id,
      'send_back',
      dto.reason,
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
