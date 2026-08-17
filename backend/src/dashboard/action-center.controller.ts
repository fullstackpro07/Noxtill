import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ActionCenterService } from './action-center.service';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ActionItemPriority, ActionItemType, Role } from '@prisma/client';

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
