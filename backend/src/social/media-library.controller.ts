import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaLibraryService } from './media-library.service';
import { GenerateMediaImageDto, UpdateMediaAssetDto } from './dto/media.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('media')
export class MediaLibraryController {
  constructor(private readonly media: MediaLibraryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('type') type?: string) {
    return this.media.list(user.businessId, type);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.media.upload(user.businessId, file);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('generate')
  generateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateMediaImageDto,
  ) {
    return this.media.generateImage(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMediaAssetDto,
  ) {
    return this.media.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.media.remove(user.businessId, id);
  }
}
