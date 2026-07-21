import { Body, Controller, Param, Post } from '@nestjs/common';
import { PublicBookingService } from './public-booking.service';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('public/appt')
export class PublicAppointmentController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Public()
  @Post(':token/reschedule')
  reschedule(
    @Param('token') token: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.publicBookingService.reschedule(token, dto.startsAt);
  }

  @Public()
  @Post(':token/cancel')
  cancel(@Param('token') token: string) {
    return this.publicBookingService.cancel(token);
  }
}
