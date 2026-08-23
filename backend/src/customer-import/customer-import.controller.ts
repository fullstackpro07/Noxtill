import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerImportService } from './customer-import.service';
import { RemapImportDto } from './dto/remap-import.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('customers/import')
export class CustomerImportController {
  constructor(private readonly importService: CustomerImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  stage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.importService.stageImport(user.businessId, file);
  }

  @Get(':batch')
  getBatch(@Param('batch') batchId: string) {
    return this.importService.getBatch(batchId);
  }

  /** Column-mapping (UPD-BE-099) — the raw file headers plus the currently-suggested mapping. */
  @Get(':batch/columns')
  getColumns(@Param('batch') batchId: string) {
    return this.importService.getColumns(batchId);
  }

  /** Re-stages the batch under a corrected mapping, without re-uploading (UPD-BE-099). */
  @Patch(':batch/remap')
  remap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batch') batchId: string,
    @Body() dto: RemapImportDto,
  ) {
    return this.importService.remap(user.businessId, batchId, dto.mapping);
  }

  @Post(':batch/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batch') batchId: string,
  ) {
    return this.importService.confirm(user.businessId, batchId);
  }
}
