import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { HeldSalesService } from './held-sales.service';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('sales/held')
export class HeldSalesController {
  constructor(private readonly heldSalesService: HeldSalesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.heldSalesService.list(user.businessId);
  }

  @Post()
  hold(@CurrentUser() user: AuthenticatedUser, @Body() dto: HoldSaleDto) {
    return this.heldSalesService.hold(user.businessId, dto);
  }

  @Post(':id/resume')
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResumeHeldSaleDto,
  ) {
    return this.heldSalesService.resume(user.businessId, id, dto);
  }

  /** UPD-FE-005e — must be declared before `:id` so it isn't swallowed by that param route. */
  @Post('discard-old')
  discardOlderThanToday(@CurrentUser() user: AuthenticatedUser) {
    return this.heldSalesService.discardOlderThanToday(user.businessId);
  }

  @Delete(':id')
  discard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.heldSalesService.discard(user.businessId, id);
  }
}
