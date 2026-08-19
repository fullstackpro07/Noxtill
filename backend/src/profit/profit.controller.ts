import { Controller, Get, Query } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { QueryProfitProductsDto } from './dto/query-profit-products.dto';
import { QueryPnlDto } from './dto/query-pnl.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('profit')
export class ProfitController {
  constructor(private readonly profitService: ProfitService) {}

  @Get('products')
  byProduct(@Query() query: QueryProfitProductsDto) {
    return this.profitService.byProduct(query.window ?? 30);
  }

  @Get('time')
  byTime() {
    return this.profitService.byTime();
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
