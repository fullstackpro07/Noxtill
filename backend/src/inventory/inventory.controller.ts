import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { ReorderSuggestionsService } from './reorder-suggestions.service';
import { ProductWaitlistService } from './product-waitlist.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { AddProductWaitlistDto } from './dto/add-product-waitlist.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { StockCountStatus } from '@prisma/client';

@Controller()
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockCountService: StockCountService,
    private readonly reorderSuggestions: ReorderSuggestionsService,
    private readonly productWaitlist: ProductWaitlistService,
  ) {}

  @Post('inventory/purchases')
  recordPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.inventoryService.recordPurchase(user.businessId, dto);
  }

  @Post('inventory/wastage')
  recordWastage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWastageDto,
  ) {
    return this.inventoryService.recordWastage(user.businessId, dto);
  }

  @Get('inventory')
  listInventory() {
    return this.inventoryService.listInventory();
  }

  @Get('inventory/:product/movements')
  getMovements(@Param('product') productId: string) {
    return this.inventoryService.getMovements(productId);
  }

  @Get('stock')
  listStock(@Query('status') status?: string) {
    return status === 'low'
      ? this.inventoryService.listLowStock()
      : this.inventoryService.listInventory();
  }

  @Get('stock/movements')
  listMovements(@Query() query: QueryMovementsDto) {
    return this.inventoryService.listMovements({
      productId: query.productId,
      kind: query.kind,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get('stock/reorder-suggestions')
  reorderSuggestionsList(@CurrentUser() user: AuthenticatedUser) {
    return this.reorderSuggestions.list(user.businessId);
  }

  @Post('stock/counts')
  createStockCount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockCountDto,
  ) {
    return this.stockCountService.create(user.businessId, user.sub, dto);
  }

  @Get('stock/counts')
  listStockCounts(@Query('status') status?: StockCountStatus) {
    return this.stockCountService.list(status);
  }

  @Get('stock/counts/:id')
  findStockCount(@Param('id') id: string) {
    return this.stockCountService.findOne(id);
  }

  @RequireCapability(CAPABILITIES.STOCK_COUNTS_APPLY)
  @Post('stock/counts/:id/apply')
  applyStockCount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stockCountService.apply(user.businessId, id, user.sub);
  }

  @Post('stock/:productId/waitlist')
  addToWaitlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: AddProductWaitlistDto,
  ) {
    return this.productWaitlist.add(user.businessId, productId, dto.customerId);
  }

  @Get('stock/:productId/waitlist')
  listWaitlist(@Param('productId') productId: string) {
    return this.productWaitlist.list(productId);
  }

  @Delete('stock/waitlist/:id')
  removeFromWaitlist(@Param('id') id: string) {
    return this.productWaitlist.remove(id);
  }

  @Post('stock/:productId/waitlist/notify')
  notifyWaitlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.productWaitlist.notify(user.businessId, productId);
  }
}
