import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

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
}
