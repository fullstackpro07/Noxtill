import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CostVisibilityInterceptor } from '../common/policies/cost-visibility.interceptor';
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
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { DismissInventoryCountTaskDto } from './dto/dismiss-inventory-count-task.dto';
import { ResolveInventoryWastageReviewTaskDto } from './dto/resolve-inventory-wastage-review-task.dto';

class RunInventoryAgentDto {
  @IsOptional() @IsString() @MinLength(4) @MaxLength(1000) question?: string;
}

@Controller()
@UseInterceptors(CostVisibilityInterceptor)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockCountService: StockCountService,
    private readonly reorderSuggestions: ReorderSuggestionsService,
    private readonly productWaitlist: ProductWaitlistService,
    private readonly inventoryIntelligence: InventoryIntelligenceService,
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

  @Get('inventory/agent-runs')
  listInventoryAgentRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryIntelligence.listRuns(user.businessId);
  }

  @Get('inventory/agent-outcomes')
  listInventoryAgentActionOutcomes(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryIntelligence.listActionOutcomes(user.businessId);
  }

  @Get('inventory/agent-transfer-outcomes')
  listInventoryAgentTransferOutcomes(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryIntelligence.listBranchTransferOutcomes(
      user.businessId,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-runs')
  runInventoryAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
    @Body() dto?: RunInventoryAgentDto,
  ) {
    return this.inventoryIntelligence.run(
      user.businessId,
      user.sub,
      idempotencyKey,
      {},
      dto?.question,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-recommendations/:id/count-task')
  requestInventoryCountTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventoryIntelligence.requestCountTask(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-recommendations/:id/dismiss')
  dismissInventoryReorderRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DismissInventoryCountTaskDto,
  ) {
    return this.inventoryIntelligence.dismissReorderRecommendation(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-recommendations/:id/transfer-draft')
  prepareInventoryBranchTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventoryIntelligence.prepareBranchTransfer(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-count-tasks/:id/dismiss')
  dismissInventoryCountTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DismissInventoryCountTaskDto,
  ) {
    return this.inventoryIntelligence.dismissCountTask(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
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

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('stock/:productId/waitlist/notification-preview')
  previewWaitlistNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.productWaitlist.previewNotification(
      user.businessId,
      user.sub,
      productId,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-recommendations/:id/wastage-review-task')
  requestInventoryWastageReviewTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventoryIntelligence.requestWastageReviewTask(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-wastage-review-tasks/:id/resolve')
  resolveInventoryWastageReviewTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveInventoryWastageReviewTaskDto,
  ) {
    return this.inventoryIntelligence.resolveWastageReviewTask(
      user.businessId,
      user.sub,
      id,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.INVENTORY_AGENT_RUN)
  @Post('inventory/agent-wastage-review-tasks/:id/dismiss')
  dismissInventoryWastageReviewTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DismissInventoryCountTaskDto,
  ) {
    return this.inventoryIntelligence.dismissWastageReviewTask(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }
}
