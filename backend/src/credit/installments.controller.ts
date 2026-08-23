import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InstallmentsService } from './installments.service';
import { RescheduleInstallmentDto } from './dto/reschedule-installment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('installments')
export class InstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  @Get()
  list(@Query('due') due?: 'today') {
    return this.installmentsService.list(due);
  }

  @Post(':id/pay')
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.installmentsService.pay(user.businessId, id);
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleInstallmentDto,
  ) {
    return this.installmentsService.reschedule(user.businessId, id, dto);
  }
}
