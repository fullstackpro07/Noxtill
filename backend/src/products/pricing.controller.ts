import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { BulkPriceDto } from './dto/bulk-price.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('products')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /** Owner/manager only — a wide-reaching, money-moving bulk action (same bar as returns approval). */
  @RequireCapability(CAPABILITIES.PRICING_MANAGE)
  @Patch('bulk-price')
  bulkPrice(@Body() dto: BulkPriceDto) {
    return this.pricingService.bulkPrice(dto);
  }

  @Get(':id/price-history')
  priceHistory(@Param('id') id: string) {
    return this.pricingService.priceHistory(id);
  }

  @Get(':id/price-suggestion')
  suggestedPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pricingService.suggestedPrice(user.businessId, id);
  }
}
