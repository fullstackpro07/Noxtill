import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerImportService } from './customer-import.service';
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

  @Post(':batch/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batch') batchId: string,
  ) {
    return this.importService.confirm(user.businessId, batchId);
  }
}
