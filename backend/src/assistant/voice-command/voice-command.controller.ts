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
import { VoiceCommandService } from './voice-command.service';
import { ConfirmVoiceCommandDto } from './dto/confirm-voice-command.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';

@Controller('assistant/voice-command')
export class VoiceCommandController {
  constructor(private readonly voiceCommandService: VoiceCommandService) {}

  @Post('propose')
  @UseInterceptors(FileInterceptor('audio'))
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('audio file is required');
    return this.voiceCommandService.propose(user.businessId, user.sub, file);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmVoiceCommandDto,
  ) {
    return this.voiceCommandService.confirm(user, id, dto.argsOverride);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.voiceCommandService.cancel(user.businessId, id);
  }
}
