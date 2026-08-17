import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

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
