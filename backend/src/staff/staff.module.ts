import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { AttendanceService } from './attendance.service';
import { CommissionsService } from './commissions.service';
import { StaffController } from './staff.controller';

@Module({
  controllers: [StaffController],
  providers: [StaffService, AttendanceService, CommissionsService],
  exports: [StaffService],
})
export class StaffModule {}
