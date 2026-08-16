import { Controller, Get, Param, Query } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import type { WidgetRangeDays } from './widgets.constants';

@Controller('widgets')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get('registry')
  registry() {
    return this.widgetsService.listRegistry();
  }

  @Get(':key')
  data(@Param('key') key: string, @Query('days') daysParam?: string) {
    // Left as `Number(...)` rather than a validated DTO — WidgetsService.getWidgetData rejects anything
    // outside WIDGET_RANGE_DAYS (including NaN from garbage input) with one consistent INVALID_RANGE error.
    const days =
      daysParam === undefined
        ? undefined
        : (Number(daysParam) as WidgetRangeDays);
    return this.widgetsService.getWidgetData(key, days);
  }
}
