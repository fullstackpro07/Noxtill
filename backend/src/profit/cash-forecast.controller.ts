import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CashForecastService } from './cash-forecast.service';
import { RecurringObligationsService } from './recurring-obligations.service';
import { QueryCashForecastDto } from './dto/query-cash-forecast.dto';
import { CreateRecurringObligationDto } from './dto/create-recurring-obligation.dto';
import { UpdateRecurringObligationDto } from './dto/update-recurring-obligation.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CASH_FORECAST_DEFAULT_DAYS } from './cash-forecast.constants';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** UPD-BE-106 fix-it: no capability gate previously existed on real cash-flow/obligation data. */
@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller()
export class CashForecastController {
  constructor(
    private readonly cashForecast: CashForecastService,
    private readonly recurringObligations: RecurringObligationsService,
  ) {}

  @Get('cash-forecast')
  forecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryCashForecastDto,
  ) {
    return this.cashForecast.forecast(
      user.businessId,
      query.days ?? CASH_FORECAST_DEFAULT_DAYS,
    );
  }

  @Get('recurring-obligations')
  list() {
    return this.recurringObligations.list();
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post('recurring-obligations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecurringObligationDto,
  ) {
    return this.recurringObligations.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Put('recurring-obligations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRecurringObligationDto) {
    return this.recurringObligations.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Delete('recurring-obligations/:id')
  remove(@Param('id') id: string) {
    return this.recurringObligations.remove(id);
  }
}
