import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { ExportsService } from './exports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '../../generated/prisma';
import { isExportKind } from './exports.constants';

/** All routes owner-only — full-account exports are excluded from managers per the spec's RBAC rule. */
@Roles(Role.owner)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(':kind')
  generate(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    if (!isExportKind(kind)) {
      throw new BadRequestException(`Unknown export kind: ${kind}`);
    }
    return this.exports.generateXlsx(user.businessId, kind);
  }

  @Post('account-zip')
  accountZip(@CurrentUser() user: AuthenticatedUser) {
    return this.exports.enqueueAccountZip(user.businessId, user.sub);
  }
}
