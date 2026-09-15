import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { DeclineQuotationDto } from './dto/decline-quotation.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  findAll() {
    return this.quotationsService.findAll();
  }

  @Get('summary')
  summary() {
    return this.quotationsService.summary();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.create(user.businessId, dto);
  }

  @Post(':id/send')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quotationsService.send(user.businessId, id);
  }

  @Post(':id/decline')
  decline(@Param('id') id: string, @Body() dto: DeclineQuotationDto) {
    return this.quotationsService.decline(id, dto.reason);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quotationsService.duplicate(user.businessId, id);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quotationsService.convert(user.businessId, id);
  }
}
