import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWindowService } from './whatsapp-window.service';
import { TokenCipherService } from '../integrations/token-cipher.service';

@Module({
  providers: [WhatsappService, WhatsappWindowService, TokenCipherService],
  exports: [WhatsappService, WhatsappWindowService],
})
export class WhatsappModule {}
