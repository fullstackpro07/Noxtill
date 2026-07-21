import { ConfigService } from '@nestjs/config';
import { ChannelSendParams, ChannelSendResult, ChannelSender } from './channel-sender.interface';
export declare class SmsService implements ChannelSender {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    send(params: ChannelSendParams): Promise<ChannelSendResult>;
}
