import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  list() {
    return this.routes.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.routes.findOne(id);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRouteDto) {
    return this.routes.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Post(':id/optimise')
  optimise(@Param('id') id: string) {
    return this.routes.optimise(id);
  }
}
