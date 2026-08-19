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
}
