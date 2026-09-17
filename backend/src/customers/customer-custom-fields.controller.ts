import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CustomerCustomFieldsService } from './customer-custom-fields.service';
import { CreateCustomerCustomFieldDto } from './dto/create-customer-custom-field.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('customer-custom-fields')
export class CustomerCustomFieldsController {
  constructor(private readonly service: CustomerCustomFieldsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerCustomFieldDto,
  ) {
    return this.service.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.businessId, id);
  }
}
