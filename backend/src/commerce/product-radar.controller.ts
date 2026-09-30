import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductOpportunityStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CreateProductOpportunityDto,
  ProductOpportunityActionDto,
  UpdateProductOpportunityDto,
} from './dto/product-opportunity.dto';
import { ProductRadarService } from './product-radar.service';

@Controller('commerce/product-radar')
export class ProductRadarController {
  constructor(private readonly productRadar: ProductRadarService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProductOpportunityStatus,
    @Query('search') search?: string,
  ) {
    return this.productRadar.list(user.businessId, { status, search });
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductOpportunityDto,
  ) {
    return this.productRadar.create(user.businessId, user.sub, dto);
  }

  @Get(':id/audit')
  listAudit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productRadar.listAudit(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/:action')
  action(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() dto: ProductOpportunityActionDto,
  ) {
    return this.productRadar.action(user.businessId, user.sub, id, action, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productRadar.getOne(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductOpportunityDto,
  ) {
    return this.productRadar.update(user.businessId, user.sub, id, dto);
  }
}
