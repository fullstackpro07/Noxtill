export interface ChannelSendResult {
  providerRef: string;
}

export interface ChannelSendParams {
  to: string;
  text: string;
  /** Utility vs marketing — some providers (e.g. WhatsApp templates) need this to pick a template class. */
  templateKey: string;
  locale: string;
  businessId: string;
  customerId?: string;
}

/** Common contract every channel adapter (WhatsApp/SMS/Email) implements — spec §3.1. */
export interface ChannelSender {
  send(params: ChannelSendParams): Promise<ChannelSendResult>;
}

export const WHATSAPP_SENDER = 'WHATSAPP_SENDER';
export const SMS_SENDER = 'SMS_SENDER';
export const EMAIL_SENDER = 'EMAIL_SENDER';
