import { Controller, Get, Param } from '@nestjs/common';
import { WidgetsService } from './widgets.service';

@Controller('widgets')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get('registry')
  registry() {
    return this.widgetsService.listRegistry();
  }

  @Get(':key')
  data(@Param('key') key: string) {
    return this.widgetsService.getWidgetData(key);
  }
}
