import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { CustomersExportService } from './customers-export.service';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
import { ExportCustomersDto } from './dto/export-customers.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('customers')
export class CustomersExportController {
  constructor(
    private readonly exportService: CustomersExportService,
    private readonly privacySettings: CustomerPrivacySettingsService,
  ) {}

  /** Bulk export (UPD-BE-101) — gated by the real `CustomerPrivacySettings.staffCanExport` toggle
   * for Staff, not a fixed capability, since the whole point of that setting is to let an owner
   * turn this on/off per business. Owner/Manager are always allowed. */
  @Post('export')
  async export(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExportCustomersDto) {
    if (user.role === 'staff') {
      const settings = await this.privacySettings.get(user.businessId);
      if (!settings.staffCanExport) {
        throw new ForbiddenException('Exporting customers is not enabled for your role');
      }
    }
    const allowCreditField = user.role !== 'staff' || (await this.privacySettings.get(user.businessId)).creditBalanceVisibleToStaff;
    return this.exportService.generate(user.businessId, user.sub, dto, allowCreditField);
  }

  @Get('export-history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.exportService.history(user.businessId);
  }
}
