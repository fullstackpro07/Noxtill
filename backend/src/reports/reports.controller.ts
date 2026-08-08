import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { isReportKind } from './reports.types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post(':kind')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() dto: GenerateReportDto,
  ) {
    if (!isReportKind(kind)) {
      throw new BadRequestException(`Unknown report kind: ${kind}`);
    }
    return this.reports.generate(kind, dto.month, user);
  }

  @Post(':kind/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() dto: GenerateReportDto,
  ) {
    if (!isReportKind(kind)) {
      throw new BadRequestException(`Unknown report kind: ${kind}`);
    }
    return this.reports.send(kind, dto.month, user);
  }
}
