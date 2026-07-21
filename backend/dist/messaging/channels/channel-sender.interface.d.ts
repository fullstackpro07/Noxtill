export interface ChannelSendResult {
    providerRef: string;
}
export interface ChannelSendParams {
    to: string;
    text: string;
    templateKey: string;
    locale: string;
    businessId: string;
    customerId?: string;
}
export interface ChannelSender {
    send(params: ChannelSendParams): Promise<ChannelSendResult>;
}
export declare const WHATSAPP_SENDER = "WHATSAPP_SENDER";
export declare const SMS_SENDER = "SMS_SENDER";
export declare const EMAIL_SENDER = "EMAIL_SENDER";
