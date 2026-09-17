import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
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
  constructor(
    private readonly customersService: CustomersService,
    private readonly privacySettings: CustomerPrivacySettingsService,
  ) {}

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

  /** Customer Settings (UPD-BE-101): a Staff caller may only ever set `status: active` — anything
   * else (archived/blocked/inactive) requires the real `CustomerPrivacySettings.staffCanArchive`
   * toggle, checked here rather than a fixed capability so an owner can turn it on per business. */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    if (user.role === 'staff' && dto.status && dto.status !== 'active') {
      const settings = await this.privacySettings.get(user.businessId);
      if (!settings.staffCanArchive) {
        throw new ForbiddenException('Changing customer status is not enabled for your role');
      }
    }
    return this.customersService.update(user.businessId, id, dto);
  }

  /** GDPR-style personal-data export (UPD-BE-097) — real, not a placeholder. */
  @Get(':id/export')
  export(@Param('id') id: string) {
    return this.customersService.export(id);
  }

  /** Duplicate resolution (UPD-BE-097) — merges `duplicateCustomerId`'s real history into `:id`,
   * then deletes it. Gated for Staff by the real `CustomerPrivacySettings.staffCanMerge` toggle. */
  @Post(':id/merge')
  async merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MergeCustomerDto,
  ) {
    if (user.role === 'staff') {
      const settings = await this.privacySettings.get(user.businessId);
      if (!settings.staffCanMerge) {
        throw new ForbiddenException('Merging customers is not enabled for your role');
      }
    }
    return this.customersService.merge(id, dto.duplicateCustomerId);
  }

  /** GDPR erasure (spec §6) — owner/manager only, matching "manager = all but billing/plan/role-changes/full-exports". */
  @RequireCapability(CAPABILITIES.CUSTOMERS_ERASE)
  @Delete(':id')
  erase(@Param('id') id: string, @Body() dto: EraseCustomerDto) {
    return this.customersService.erase(id, dto.confirm);
  }
}
