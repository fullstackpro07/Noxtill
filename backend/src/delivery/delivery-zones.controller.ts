import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly zones: DeliveryZonesService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.zones.findOne(id);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeliveryZoneDto,
  ) {
    return this.zones.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.zones.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.zones.remove(id);
  }
}
