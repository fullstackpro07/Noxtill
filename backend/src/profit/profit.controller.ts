import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { DeadHoursOfferService } from './dead-hours-offer.service';
import { QueryProfitProductsDto } from './dto/query-profit-products.dto';
import { QueryPnlDto } from './dto/query-pnl.dto';
import { SendDeadHoursOfferDto } from './dto/send-dead-hours-offer.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';

/** UPD-BE-106 fix-it: this whole controller had no capability gate despite being real P&L/margin data. */
@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit')
export class ProfitController {
  constructor(
    private readonly profitService: ProfitService,
    private readonly deadHoursOffer: DeadHoursOfferService,
    private readonly financialIntelligence: FinancialIntelligenceService,
  ) {}

  @Get('agent-runs')
  listFinancialAgentRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.financialIntelligence.listRuns(user.businessId);
  }

  @Get('xero-open-items')
  previewXeroOpenItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.financialIntelligence.previewXeroOpenItems(
      user.businessId,
      branchId,
    );
  }

  @Get('xero-bank-transaction-status')
  previewXeroBankTransactionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.financialIntelligence.previewXeroBankTransactionStatus(
      user.businessId,
      branchId,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_AGENT_RUN)
  @Post('agent-runs')
  runFinancialAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() query: QueryPnlDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.financialIntelligence.run(
      user.businessId,
      user.sub,
      query,
      idempotencyKey,
    );
  }

  @Get('products')
  byProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProfitProductsDto,
  ) {
    return this.profitService.byProduct(
      user.businessId,
      query.branchId,
      query.window ?? 30,
    );
  }

  @Get('products/suggestions')
  productSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProfitProductsDto,
  ) {
    return this.profitService.productSuggestions(
      user.businessId,
      query.branchId,
      query.window ?? 30,
    );
  }

  @Get('time')
  byTime(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.profitService.byTime(user.businessId, branchId);
  }

  @Post('time/dead-hours-offer')
  generateDeadHoursOffer() {
    return this.deadHoursOffer.generate();
  }

  @Post('time/dead-hours-offer/send')
  sendDeadHoursOffer(@Body() dto: SendDeadHoursOfferDto) {
    return this.deadHoursOffer.send(dto.segment, dto.offerText);
  }

  @Get('pnl')
  pnl(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPnlDto) {
    return this.profitService.pnl(
      user.businessId,
      query.month,
      query.period,
      query.branchId,
    );
  }

  @Get('bundle-suggestions')
  bundleSuggestions() {
    return this.profitService.bundleSuggestions();
  }
}
