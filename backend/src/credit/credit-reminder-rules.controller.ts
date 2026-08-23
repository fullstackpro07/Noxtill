import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreditReminderRulesService } from './credit-reminder-rules.service';
import { CreateCreditReminderRuleDto } from './dto/create-credit-reminder-rule.dto';
import { UpdateCreditReminderRuleDto } from './dto/update-credit-reminder-rule.dto';
import { TestSendCreditReminderRuleDto } from './dto/test-send-credit-reminder-rule.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('credit/reminder-rules')
export class CreditReminderRulesController {
  constructor(private readonly reminderRules: CreditReminderRulesService) {}

  @Get()
  list() {
    return this.reminderRules.list();
  }

  @Get('recovery-rate-by-stage')
  recoveryRateByStage() {
    return this.reminderRules.recoveryRateByStage();
  }

  @RequireCapability(CAPABILITIES.CREDIT_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCreditReminderRuleDto,
  ) {
    return this.reminderRules.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.CREDIT_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCreditReminderRuleDto) {
    return this.reminderRules.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.CREDIT_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reminderRules.remove(id);
  }

  @RequireCapability(CAPABILITIES.CREDIT_MANAGE)
  @Post(':id/test-send')
  testSend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TestSendCreditReminderRuleDto,
  ) {
    return this.reminderRules.testSend(user.businessId, id, dto);
  }
}
