import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ReminderRulesService } from './reminder-rules.service';
import { CreateReminderRuleDto } from './dto/create-reminder-rule.dto';
import { UpdateReminderRuleDto } from './dto/update-reminder-rule.dto';
import { TestSendReminderRuleDto } from './dto/test-send-reminder-rule.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('reminder-rules')
export class ReminderRulesController {
  constructor(private readonly reminderRules: ReminderRulesService) {}

  @Get()
  list() {
    return this.reminderRules.list();
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReminderRuleDto,
  ) {
    return this.reminderRules.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReminderRuleDto) {
    return this.reminderRules.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reminderRules.remove(id);
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Post(':id/test-send')
  testSend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TestSendReminderRuleDto,
  ) {
    return this.reminderRules.testSend(user.businessId, id, dto);
  }
}
