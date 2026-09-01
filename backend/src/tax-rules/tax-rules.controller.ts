import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { UpdateTaxRuleDto } from './dto/update-tax-rule.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('tax-rules')
export class TaxRulesController {
  constructor(private readonly taxRules: TaxRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.taxRules.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.TAX_RULES_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.taxRules.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.TAX_RULES_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.taxRules.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.TAX_RULES_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.taxRules.remove(user.businessId, id);
  }
}
