import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CancelCommerceWorkOrderDto,
  CompleteCommerceWorkOrderDto,
  CreateCommerceBomDto,
  CreateCommerceWorkOrderDto,
  ReleaseCommerceWorkOrderDto,
} from './dto/commerce-production.dto';
import { CommerceProductionService } from './commerce-production.service';

@Controller('commerce/production')
export class CommerceProductionController {
  constructor(private readonly production: CommerceProductionService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.production.summary(user.businessId);
  }

  @Get('boms')
  listBoms(@CurrentUser() user: AuthenticatedUser) {
    return this.production.listBoms(user.businessId);
  }

  @Get('work-orders')
  listWorkOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.production.listWorkOrders(user.businessId);
  }

  @Get('work-orders/:id/audit')
  audit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.production.audit(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('boms')
  createBom(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceBomDto,
  ) {
    return this.production.createBom(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('work-orders')
  createWorkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceWorkOrderDto,
  ) {
    return this.production.createWorkOrder(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('work-orders/:id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.production.start(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('work-orders/:id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteCommerceWorkOrderDto,
  ) {
    return this.production.complete(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('work-orders/:id/release')
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReleaseCommerceWorkOrderDto,
  ) {
    return this.production.release(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('work-orders/:id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelCommerceWorkOrderDto,
  ) {
    return this.production.cancel(user.businessId, user.sub, id, dto.reason);
  }
}
