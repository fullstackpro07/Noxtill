import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoCalendarService } from './seo-calendar.service';

class RescheduleDto {
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

class AssignDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeUserId?: string | null;
}

@Controller('seo-autopilot/calendar')
export class SeoCalendarController {
  constructor(private readonly calendar: SeoCalendarService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.calendar(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.calendar.reschedule(
      user.businessId,
      user.sub,
      id,
      dto.dueAt ?? null,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post(':id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ) {
    return this.calendar.assign(
      user.businessId,
      user.sub,
      id,
      dto.assigneeUserId || null,
    );
  }
}
