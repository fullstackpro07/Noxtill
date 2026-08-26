import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffService } from './staff.service';
import { AttendanceService } from './attendance.service';
import { CommissionsService } from './commissions.service';
import { StaffController } from './staff.controller';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { TimeOffService } from './time-off.service';
import { TimeOffController } from './time-off.controller';
import { TimesheetsService } from './timesheets.service';
import { TimesheetsController } from './timesheets.controller';
import { AdvancesService } from './advances.service';
import { AdvancesController } from './advances.controller';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    StaffController,
    ShiftsController,
    TimeOffController,
    TimesheetsController,
    AdvancesController,
    PayrollController,
  ],
  providers: [
    StaffService,
    AttendanceService,
    CommissionsService,
    ShiftsService,
    TimeOffService,
    TimesheetsService,
    AdvancesService,
    PayrollService,
  ],
  exports: [StaffService, CommissionsService],
})
export class StaffModule {}
