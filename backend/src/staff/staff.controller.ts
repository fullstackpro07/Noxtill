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
  list() {
    return this.staffService.list();
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

  @Get('staff/commissions')
  commissions(@Query() query: QueryCommissionsDto) {
    return this.commissionsService.report(query.month);
  }

  @Post('attendance/toggle')
  toggleAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.toggle(user.businessId, user.sub);
  }
}
