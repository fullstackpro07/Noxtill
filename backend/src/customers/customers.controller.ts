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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { EraseCustomerDto } from './dto/erase-customer.dto';
import { MergeCustomerDto } from './dto/merge-customer.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user.businessId, dto);
  }

  @Get()
  findAll(@Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  /** GDPR-style personal-data export (UPD-BE-097) — real, not a placeholder. */
  @Get(':id/export')
  export(@Param('id') id: string) {
    return this.customersService.export(id);
  }

  /** Duplicate resolution (UPD-BE-097) — merges `duplicateCustomerId`'s real history into `:id`, then deletes it. */
  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() dto: MergeCustomerDto) {
    return this.customersService.merge(id, dto.duplicateCustomerId);
  }

  /** GDPR erasure (spec §6) — owner/manager only, matching "manager = all but billing/plan/role-changes/full-exports". */
  @RequireCapability(CAPABILITIES.CUSTOMERS_ERASE)
  @Delete(':id')
  erase(@Param('id') id: string, @Body() dto: EraseCustomerDto) {
    return this.customersService.erase(id, dto.confirm);
  }
}
