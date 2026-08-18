import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import {
  CreateStockTransferDto,
  RejectStockTransferDto,
} from './dto/create-stock-transfer.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { StockTransferStatus } from '@prisma/client';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfers: StockTransfersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockTransferDto,
  ) {
    return this.stockTransfers.create(user.businessId, user.sub, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: StockTransferStatus,
  ) {
    return this.stockTransfers.list(user.businessId, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockTransfers.findOne(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockTransfers.approve(user.businessId, id, user.sub);
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Patch(':id/ship')
  ship(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockTransfers.ship(user.businessId, id, user.sub);
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Patch(':id/receive')
  receive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockTransfers.receive(user.businessId, id, user.sub);
  }

  @RequireCapability(CAPABILITIES.STOCK_TRANSFERS_APPROVE)
  @Patch(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectStockTransferDto,
  ) {
    return this.stockTransfers.reject(
      user.businessId,
      id,
      user.sub,
      dto.reason,
    );
  }
}
