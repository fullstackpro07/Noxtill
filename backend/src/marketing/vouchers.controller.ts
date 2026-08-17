import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { IssueVoucherDto } from './dto/issue-voucher.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @RequireCapability(CAPABILITIES.VOUCHERS_MANAGE)
  @Post()
  issue(@CurrentUser() user: AuthenticatedUser, @Body() dto: IssueVoucherDto) {
    return this.vouchers.issue(user.businessId, dto);
  }

  @Get()
  list() {
    return this.vouchers.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vouchers.findOne(id);
  }

  @RequireCapability(CAPABILITIES.VOUCHERS_MANAGE)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.vouchers.cancel(id);
  }
}
