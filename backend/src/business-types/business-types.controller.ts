import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BusinessTypesService } from './business-types.service';
import { AiMapBusinessTypeDto } from './dto/ai-map-business-type.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('business-types')
export class BusinessTypesController {
  constructor(private readonly businessTypesService: BusinessTypesService) {}

  @Public()
  @Get()
  search(@Query('q') q?: string) {
    return this.businessTypesService.search(q);
  }

  @Public()
  @Post('ai-map')
  aiMap(@Body() dto: AiMapBusinessTypeDto) {
    return this.businessTypesService.aiMap(dto);
  }
}
