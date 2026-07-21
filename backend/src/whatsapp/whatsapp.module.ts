import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWindowService } from './whatsapp-window.service';

@Module({
  providers: [WhatsappService, WhatsappWindowService],
  exports: [WhatsappService, WhatsappWindowService],
})
export class WhatsappModule {}
