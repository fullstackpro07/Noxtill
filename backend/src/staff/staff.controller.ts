import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { AttendanceService } from './attendance.service';
import { CommissionsService } from './commissions.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryCommissionsDto } from './dto/query-commissions.dto';
import { ManualAttendanceDto } from './dto/manual-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { MarkCommissionPaidDto } from './dto/mark-commission-paid.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly attendanceService: AttendanceService,
    private readonly commissionsService: CommissionsService,
  ) {}

  @Get('staff')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.staffService.list(includeInactive === 'true');
  }

  @Get('staff/inbox')
  inbox() {
    return this.staffService.inbox();
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE)
  @Post('staff')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE)
  @Patch('staff/:id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE)
  @Delete('staff/:id')
  remove(@Param('id') id: string) {
    return this.staffService.remove(id);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE)
  @Patch('staff/:id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.staffService.reactivate(id);
  }

  @Get('staff/commissions')
  commissions(@Query() query: QueryCommissionsDto) {
    return this.commissionsService.report(query.month);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('staff/commissions/mark-paid')
  markCommissionPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkCommissionPaidDto,
  ) {
    return this.commissionsService.markPaid(
      user.businessId,
      dto.staffUserId,
      dto.month,
      user.sub,
    );
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('staff/commissions/send-statement')
  sendCommissionStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkCommissionPaidDto,
  ) {
    return this.commissionsService.sendStatement(
      user.businessId,
      dto.staffUserId,
      dto.month,
    );
  }

  @Post('attendance/toggle')
  toggleAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.toggle(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Get('attendance')
  listAttendance(
    @Query('staffUserId') staffUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.list(staffUserId, from, to);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('attendance/manual')
  manualAttendance(@Body() dto: ManualAttendanceDto) {
    return this.attendanceService.manualEntry(
      dto.staffUserId,
      dto.checkIn,
      dto.checkOut,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('attendance/:id')
  correctAttendance(
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendanceService.correct(
      id,
      dto.checkIn,
      dto.checkOut ?? null,
      dto.note,
    );
  }
}
