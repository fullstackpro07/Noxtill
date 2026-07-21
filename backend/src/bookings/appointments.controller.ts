import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(@Query() query: QueryAppointmentsDto) {
    return this.appointmentsService.findAll(query);
  }

  @Patch(':id')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      user.businessId,
      id,
      dto.status,
    );
  }
}
