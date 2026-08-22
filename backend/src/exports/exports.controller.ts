import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ExportsService } from './exports.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { isExportFormat, isExportKind } from './exports.constants';

/** All routes owner-only — full-account exports are excluded from managers per the spec's RBAC rule. */
@RequireCapability(CAPABILITIES.EXPORTS_GENERATE)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(':kind')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Query('format') format?: string,
  ) {
    if (!isExportKind(kind)) {
      throw new BadRequestException(`Unknown export kind: ${kind}`);
    }
    if (format !== undefined && !isExportFormat(format)) {
      throw new BadRequestException(`Unknown export format: ${format}`);
    }
    return this.exports.generate(user.businessId, kind, format);
  }

  @Post('account-zip')
  accountZip(@CurrentUser() user: AuthenticatedUser) {
    return this.exports.enqueueAccountZip(user.businessId, user.sub);
  }
}
