import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { PurchaseOrderStatus } from '@prisma/client';

/** UPD-BE-112 — a real financial commitment to a supplier, owner+manager only end to end (unlike Wastage, which stays staff-recordable). */
@RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrders.create(user.businessId, user.sub, dto);
  }

  @Get()
  list(@Query('status') status?: PurchaseOrderStatus) {
    return this.purchaseOrders.list(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseOrders.findOne(id);
  }

  @Post(':id/send')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.send(user.businessId, id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.purchaseOrders.confirm(id);
  }

  @Post(':id/receive')
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrders.receive(user.businessId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.purchaseOrders.cancel(id);
  }
}
