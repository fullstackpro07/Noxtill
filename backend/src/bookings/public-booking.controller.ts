import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicBookingService } from './public-booking.service';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Public()
  @Get(':biz')
  getBusinessInfo(@Param('biz') biz: string) {
    return this.publicBookingService.getBusinessInfo(biz);
  }

  @Public()
  @Get(':biz/services')
  listServices(@Param('biz') biz: string) {
    return this.publicBookingService.listServices(biz);
  }

  @Public()
  @Get(':biz/slots')
  getSlots(@Param('biz') biz: string, @Query() query: QuerySlotsDto) {
    return this.publicBookingService.getSlots(biz, query);
  }

  @Public()
  @Post(':biz')
  createBooking(
    @Param('biz') biz: string,
    @Body() dto: CreatePublicBookingDto,
  ) {
    return this.publicBookingService.createBooking(biz, dto);
  }
}
