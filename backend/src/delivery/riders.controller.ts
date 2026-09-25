import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RidersService } from './riders.service';
import { CreateRiderDto } from './dto/create-rider.dto';
import { UpdateRiderDto } from './dto/update-rider.dto';
import { RiderLocationDto } from './dto/rider-location.dto';
import { SetRiderBreakDto } from './dto/set-rider-break.dto';
import { SetLocationConsentDto } from './dto/set-location-consent.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('riders')
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Get()
  list() {
    return this.riders.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.riders.findOne(id);
  }

  @Get(':id/performance')
  performance(@Param('id') id: string) {
    return this.riders.performance(id);
  }

  @Get(':id/cash')
  async cash(@Param('id') id: string) {
    return { held: await this.riders.cashHeld(id) };
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRiderDto) {
    return this.riders.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRiderDto) {
    return this.riders.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.riders.remove(id);
  }

  @Post(':id/location')
  reportLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RiderLocationDto,
  ) {
    return this.riders.reportLocation(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post(':id/cash-handin')
  handInCash(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.riders.handInCash(user.businessId, id, user.sub);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post(':id/location-consent')
  setLocationConsent(
    @Param('id') id: string,
    @Body() dto: SetLocationConsentDto,
  ) {
    return this.riders.setLocationConsent(id, dto.consent);
  }

  @Post(':id/break')
  setBreak(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetRiderBreakDto,
  ) {
    return this.riders.setBreak(user.businessId, id, dto.onBreak);
  }
}
