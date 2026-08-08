import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  findAll() {
    return this.quotationsService.findAll();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.create(user.businessId, dto);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quotationsService.convert(user.businessId, id);
  }
}
