import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Public } from '../common/decorators/public.decorator';
import { PlatformAdminGuard } from './platform-admin.guard';

/** Every route here is @Public() (no per-business JWT applies) and gated instead by PlatformAdminGuard. */
@Controller('admin')
@Public()
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('activation-funnel')
  activationFunnel(@Query('sinceDays') sinceDays?: string) {
    return this.adminService.activationFunnel(
      sinceDays ? Number(sinceDays) : undefined,
    );
  }

  @Get('events')
  events(@Query('name') name?: string, @Query('limit') limit?: string) {
    return this.adminService.events(name, limit ? Number(limit) : undefined);
  }

  @Get('businesses-summary')
  businessesSummary() {
    return this.adminService.businessesSummary();
  }
}
