import { Body, Controller, Get, Post } from '@nestjs/common';
import { CustomerDuplicatesService } from './customer-duplicates.service';
import { DismissCustomerDuplicateDto } from './dto/dismiss-customer-duplicate.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('customers/duplicates')
export class CustomerDuplicatesController {
  constructor(private readonly service: CustomerDuplicatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.businessId);
  }

  @Post('dismiss')
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DismissCustomerDuplicateDto,
  ) {
    return this.service.dismiss(user.businessId, user.sub, dto);
  }
}
