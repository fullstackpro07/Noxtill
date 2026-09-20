import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { DataExportsService } from './data-exports.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';

export class DataExportDto {
  @IsIn(['everything', 'selected'])
  scope!: 'everything' | 'selected';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];

  @IsIn(['csv', 'xlsx'])
  format!: 'csv' | 'xlsx';
}

/** Owner-only, enforced here on the server — exports include credit, expenses and contact data. */
@RequireCapability(CAPABILITIES.EXPORTS_GENERATE)
@Controller('exports/data')
export class DataExportsController {
  constructor(
    private readonly dataExports: DataExportsService,
    private readonly cls: ClsService,
  ) {}

  private active(user: AuthenticatedUser): string {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? user.businessId;
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.dataExports.overview(this.active(user));
  }

  @Post('preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: DataExportDto) {
    return this.dataExports.preview(this.active(user), dto);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: DataExportDto) {
    return this.dataExports.create(this.active(user), user.sub, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dataExports.detail(this.active(user), id);
  }

  @Post(':id/download')
  download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dataExports.download(this.active(user), user.sub, id);
  }

  @Post(':id/regenerate')
  regenerate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dataExports.regenerate(this.active(user), user.sub, id);
  }
}
