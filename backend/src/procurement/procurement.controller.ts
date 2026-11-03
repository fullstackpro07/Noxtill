import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  CreateProcurementRequestDto,
  ListProcurementRequestsDto,
  UpdateProcurementRequestDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { ProcurementBudgetsService } from './procurement-budgets.service';

@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly procurement: ProcurementService,
    private readonly commerceRfqs: CommerceRfqsService,
    private readonly budgets: ProcurementBudgetsService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    const [overview, budget] = await Promise.all([
      this.procurement.overview(user.businessId),
      this.budgets.summary(user.businessId),
    ]);
    return {
      ...overview,
      metrics: {
        ...overview.metrics,
        spendVsBudget: budget.available
          ? {
              value: budget.totals!.percentUsed,
              availability: 'tracked' as const,
              detail: `${budget.totals!.actual} of ${budget.totals!.budget} ${budget.currency} used, fiscal year to date, across the Finance accounts used as budget codes (${budget.budgetVersion!.name} v${budget.budgetVersion!.version}).`,
            }
          : {
              value: null,
              availability: 'not_available' as const,
              detail: budget.reason!,
            },
      },
      dataCompleteness: {
        ...overview.dataCompleteness,
        procurementBudgets: budget.available ? 'tracked' : 'not_available',
      },
    };
  }

  @Get('budget')
  budgetSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.budgets.summary(user.businessId);
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Get('sourcing')
  sourcing(@CurrentUser() user: AuthenticatedUser) {
    return this.procurement.sourcing(user.businessId);
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Get('three-way-match')
  threeWayMatch(@CurrentUser() user: AuthenticatedUser) {
    return this.procurement.threeWayMatch(user.businessId);
  }

  @Get('requests')
  listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProcurementRequestsDto,
  ) {
    return this.procurement.listRequests(user.businessId, query);
  }

  @Get('requests/:id')
  getRequest(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.procurement.getRequest(user.businessId, id);
  }

  @Get('requests/:id/budget')
  getRequestBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.budgets.forRequest(user.businessId, id);
  }

  @Post('requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProcurementRequestDto,
  ) {
    return this.procurement.createRequest(user.businessId, user.sub, dto);
  }

  @Patch('requests/:id')
  updateDraftRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProcurementRequestDto,
  ) {
    return this.procurement.updateDraftRequest(
      user.businessId,
      user.sub,
      id,
      dto,
      user.role === 'owner' || user.role === 'manager',
    );
  }

  @Post('requests/:id/submit')
  submitRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.procurement.submitRequest(user.businessId, user.sub, id);
  }

  @Post('requests/:id/withdraw')
  withdrawRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.procurement.withdrawRequest(
      user.businessId,
      user.sub,
      id,
      user.role === 'owner' || user.role === 'manager',
    );
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Post('requests/:id/convert')
  convertRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.procurement.convertRequestToPurchaseOrder(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Post('requests/:id/source')
  sourceRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.commerceRfqs.createFromProcurementRequest(
      user.businessId,
      user.sub,
      id,
    );
  }
}
