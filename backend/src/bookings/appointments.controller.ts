import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { RescheduleInternalAppointmentDto } from './dto/reschedule-internal-appointment.dto';
import { CreateWalkInAppointmentDto } from './dto/create-walk-in-appointment.dto';
import { CreateAppointmentRequestDto } from './dto/create-appointment-request.dto';
import { DeclineAppointmentRequestDto } from './dto/decline-appointment-request.dto';
import { SuggestAlternativeDto } from './dto/suggest-alternative.dto';
import { BulkAppointmentActionDto } from './dto/bulk-appointment-action.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(@Query() query: QueryAppointmentsDto) {
    return this.appointmentsService.findAll(query);
  }

  @Get('no-show-report')
  noShowReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('months') months?: string,
  ) {
    return this.appointmentsService.noShowReport(
      user.businessId,
      months ? Number(months) : undefined,
    );
  }

  @Post()
  createWalkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWalkInAppointmentDto,
  ) {
    return this.appointmentsService.createWalkIn(user.businessId, dto);
  }

  @Post('bulk-cancel')
  bulkCancel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAppointmentActionDto,
  ) {
    return this.appointmentsService.bulkCancel(user.businessId, dto.ids);
  }

  @Post('bulk-remind')
  bulkRemind(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAppointmentActionDto,
  ) {
    return this.appointmentsService.bulkRemind(user.businessId, dto.ids);
  }

  @Post('request')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentRequestDto,
  ) {
    return this.appointmentsService.createRequest(user.businessId, dto);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointmentsService.approve(user.businessId, id);
  }

  @Post(':id/decline')
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DeclineAppointmentRequestDto,
  ) {
    return this.appointmentsService.decline(user.businessId, id, dto);
  }

  @Post(':id/suggest-alternative')
  suggestAlternative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuggestAlternativeDto,
  ) {
    return this.appointmentsService.suggestAlternative(
      user.businessId,
      id,
      dto,
    );
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
