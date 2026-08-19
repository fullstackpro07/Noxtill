import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { ReorderSuggestionsService } from './reorder-suggestions.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
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
}
