import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireStepUp } from '../common/decorators/require-step-up.decorator';
import { ScheduledExportsService } from './scheduled-exports.service';
import { CreateScheduledExportDto } from './dto/create-scheduled-export.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** Owner-only, same as the rest of `/exports` (see ExportsController). */
@RequireCapability(CAPABILITIES.EXPORTS_GENERATE)
@Controller('exports/schedules')
export class ScheduledExportsController {
  constructor(private readonly scheduledExports: ScheduledExportsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScheduledExportDto,
  ) {
    return this.scheduledExports.create(user.businessId, user.sub, dto);
  }

  @Get()
  list() {
    return this.scheduledExports.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateScheduledExportDto) {
    return this.scheduledExports.update(id, dto);
  }

  @RequireStepUp()
  @Post(':id/run')
  runNow(@Param('id') id: string) {
    return this.scheduledExports.runNow(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scheduledExports.remove(id);
  }
}
