import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceSaleService } from './voice-sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('voice/sales')
export class VoiceSaleController {
  constructor(private readonly voiceSaleService: VoiceSaleService) {}

  @Post('parse')
  @UseInterceptors(FileInterceptor('audio'))
  parse(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('audio file is required');
    return this.voiceSaleService.parse(user.businessId, file);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.voiceSaleService.confirm(user.businessId, id, dto);
  }
}
