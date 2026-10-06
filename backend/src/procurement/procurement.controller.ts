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

@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly procurement: ProcurementService,
    private readonly commerceRfqs: CommerceRfqsService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.procurement.overview(user.businessId);
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
