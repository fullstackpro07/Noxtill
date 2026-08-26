import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MarketingAssetsService } from './marketing-assets.service';
import { GenerateMarketingKitDto } from './dto/generate-marketing-kit.dto';

@Controller('marketing/kit')
export class MarketingAssetsController {
  constructor(private readonly marketingAssets: MarketingAssetsService) {}

  @Post('background')
  @UseInterceptors(FileInterceptor('background'))
  uploadBackground(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('background file is required');
    return this.marketingAssets.uploadBackground(file);
  }

  @Post()
  generate(@Body() dto: GenerateMarketingKitDto) {
    return this.marketingAssets.generate(dto);
  }
}
