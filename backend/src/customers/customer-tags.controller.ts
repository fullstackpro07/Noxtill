import { Body, Controller, Get, Post } from '@nestjs/common';
import { CustomerTagsService } from './customer-tags.service';
import { CreateCustomerTagDto } from './dto/create-customer-tag.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('customer-tags')
export class CustomerTagsController {
  constructor(private readonly service: CustomerTagsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerTagDto) {
    return this.service.create(user.businessId, dto);
  }
}
