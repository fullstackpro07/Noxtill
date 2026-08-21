import { Body, Controller, Get, Post } from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { RecordCashMovementDto } from './dto/record-cash-movement.dto';
import { ReconcileShiftDto } from './dto/reconcile-shift.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Get('cash/shift/current')
  getCurrentShift(@CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.getCurrentShift(user.businessId, user.role);
  }

  /** UPD-FE-007e: shift history for the Shift Closing screen. */
  @Get('cash/shifts')
  listShifts(@CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.listShifts(user.businessId, user.role);
  }

  @Post('cash/shift/open')
  openShift(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenShiftDto) {
    return this.cashRegisterService.openShift(user.businessId, dto);
  }

  @Post('cash/shift/close')
  closeShift(@CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.closeShift(user.businessId);
  }

  @Post('cash/movements')
  recordMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordCashMovementDto,
  ) {
    return this.cashRegisterService.recordMovement(user.businessId, dto);
  }

  @Post('cash-reconciliation')
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReconcileShiftDto,
  ) {
    return this.cashRegisterService.reconcile(user.businessId, dto);
  }
}
