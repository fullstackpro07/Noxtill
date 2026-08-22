import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositSettingsService } from './deposit-settings.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { UpdateDepositSettingsDto } from './dto/update-deposit-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly depositSettings: DepositSettingsService,
  ) {}

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.depositSettings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDepositSettingsDto,
  ) {
    return this.depositSettings.update(user.businessId, dto);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepositDto,
  ) {
    return this.depositsService.create(user.businessId, dto);
  }

  @Get()
  list(@Query('appointmentId') appointmentId?: string) {
    return this.depositsService.list(appointmentId);
  }

  @Post(':id/capture')
  capture(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.depositsService.capture(user.businessId, id);
  }

  @Post(':id/refund')
  refund(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.depositsService.refund(user.businessId, id);
  }
}
