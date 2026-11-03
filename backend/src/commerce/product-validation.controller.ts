import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { ProductValidationDecisionDto } from './dto/product-validation.dto';
import { CreateValidationProductDto } from './dto/create-validation-product.dto';
import { ProductValidationService } from './product-validation.service';

@Controller('commerce/product-validation')
export class ProductValidationController {
  constructor(private readonly validation: ProductValidationService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.validation.list(user.businessId, search);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.validation.getOne(user.businessId, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.validation.history(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/decisions')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProductValidationDecisionDto,
  ) {
    return this.validation.decide(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/product')
  createCanonicalProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateValidationProductDto,
  ) {
    return this.validation.createCanonicalProduct(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }
}
