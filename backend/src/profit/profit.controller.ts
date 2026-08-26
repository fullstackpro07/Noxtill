import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { DeadHoursOfferService } from './dead-hours-offer.service';
import { QueryProfitProductsDto } from './dto/query-profit-products.dto';
import { QueryPnlDto } from './dto/query-pnl.dto';
import { SendDeadHoursOfferDto } from './dto/send-dead-hours-offer.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** UPD-BE-106 fix-it: this whole controller had no capability gate despite being real P&L/margin data. */
@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit')
export class ProfitController {
  constructor(
    private readonly profitService: ProfitService,
    private readonly deadHoursOffer: DeadHoursOfferService,
  ) {}

  @Get('products')
  byProduct(@Query() query: QueryProfitProductsDto) {
    return this.profitService.byProduct(query.window ?? 30);
  }

  @Get('time')
  byTime() {
    return this.profitService.byTime();
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
    return this.profitService.pnl(user.businessId, query.month);
  }

  @Get('bundle-suggestions')
  bundleSuggestions() {
    return this.profitService.bundleSuggestions();
  }
}
