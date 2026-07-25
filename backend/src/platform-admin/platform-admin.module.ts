import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { AdminService } from './admin.service';
import { EventsController } from './events.controller';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  controllers: [EventsController, AdminController],
  providers: [EventsService, AdminService, PlatformAdminGuard],
})
export class PlatformAdminModule {}
