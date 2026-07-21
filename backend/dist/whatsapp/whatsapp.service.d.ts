import { ConfigService } from '@nestjs/config';
import { ChannelSendParams, ChannelSendResult, ChannelSender } from '../messaging/channels/channel-sender.interface';
import { WhatsappWindowService } from './whatsapp-window.service';
export declare class WhatsappService implements ChannelSender {
    private readonly config;
    private readonly window;
    private readonly logger;
    constructor(config: ConfigService, window: WhatsappWindowService);
    send(params: ChannelSendParams): Promise<ChannelSendResult>;
}
