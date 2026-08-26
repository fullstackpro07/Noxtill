import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import {
  CreateShiftDto,
  RequestShiftSwapDto,
  UpdateShiftDto,
} from './dto/create-shift.dto';
import { NotifyShiftsDto } from './dto/notify-shifts.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('shifts')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.shifts.create(user.businessId, dto);
  }

  @Get('shifts')
  list(
    @Query('staffUserId') staffUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shifts.list(staffUserId, from, to);
  }

  @Get('shifts/:id')
  findOne(@Param('id') id: string) {
    return this.shifts.findOne(id);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('shifts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Delete('shifts/:id')
  remove(@Param('id') id: string) {
    return this.shifts.remove(id);
  }

  @Post('shifts/:id/swap-request')
  requestSwap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestShiftSwapDto,
  ) {
    return this.shifts.requestSwap(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('shifts/:id/swap-request/approve')
  approveSwap(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shifts.approveSwap(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('shifts/:id/swap-request/reject')
  rejectSwap(@Param('id') id: string) {
    return this.shifts.rejectSwap(id);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('shifts/notify')
  notify(@CurrentUser() user: AuthenticatedUser, @Body() dto: NotifyShiftsDto) {
    return this.shifts.notify(user.businessId, dto.from, dto.to);
  }
}
