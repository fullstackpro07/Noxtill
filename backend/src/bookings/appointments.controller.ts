import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { RescheduleInternalAppointmentDto } from './dto/reschedule-internal-appointment.dto';
import { CreateWalkInAppointmentDto } from './dto/create-walk-in-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(@Query() query: QueryAppointmentsDto) {
    return this.appointmentsService.findAll(query);
  }

  @Post()
  createWalkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWalkInAppointmentDto,
  ) {
    return this.appointmentsService.createWalkIn(user.businessId, dto);
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

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleInternalAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(user.businessId, id, dto);
  }
}
