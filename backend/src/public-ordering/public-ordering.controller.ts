import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicOrderingService } from './public-ordering.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('public/order')
export class PublicOrderingController {
  constructor(private readonly publicOrderingService: PublicOrderingService) {}

  @Public()
  @Get(':biz')
  getMenu(@Param('biz') biz: string) {
    return this.publicOrderingService.getMenu(biz);
  }

  @Public()
  @Post(':biz')
  createOrder(@Param('biz') biz: string, @Body() dto: CreatePublicOrderDto) {
    return this.publicOrderingService.createOrder(biz, dto);
  }
}
