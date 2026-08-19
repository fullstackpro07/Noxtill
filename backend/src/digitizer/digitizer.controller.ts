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
import { DigitizerService } from './digitizer.service';
import { UploadDigitizerScanDto } from './dto/upload-digitizer-scan.dto';
import { UpdateDigitizerRowDto } from './dto/update-digitizer-row.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class DigitizerController {
  constructor(private readonly digitizer: DigitizerService) {}

  @Post('digitizer/upload')
  @UseInterceptors(FileInterceptor('image'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDigitizerScanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('image file is required');
    return this.digitizer.upload(user.businessId, dto.scannerType, file);
  }

  @Get('digitizer/scans/:id/rows')
  getRows(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.getRows(user.businessId, id);
  }

  @Patch('digitizer/rows/:id')
  updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDigitizerRowDto,
  ) {
    return this.digitizer.updateRow(user.businessId, id, dto);
  }

  @Get('digitizer/history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.digitizer.history(user.businessId);
  }

  @Post('imports/:id/commit')
  commit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.commit(user.businessId, id);
  }
}
