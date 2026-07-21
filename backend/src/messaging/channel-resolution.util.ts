import { MessageChannel } from '../../generated/prisma';

export interface ContactInfo {
  phone?: string | null;
  email?: string | null;
}

const FALLBACK_ORDER: MessageChannel[] = [
  MessageChannel.whatsapp,
  MessageChannel.sms,
  MessageChannel.email,
];

function hasContactFor(channel: MessageChannel, contact: ContactInfo): boolean {
  if (channel === MessageChannel.email) return !!contact.email;
  return !!contact.phone; // whatsapp + sms both need a phone number
}

/**
 * Channel resolution (BE-015 / spec §3.1): business preference first, then
 * fall back through WhatsApp → SMS → Email, picking the first channel the
 * customer actually has contact info for.
 */
export function resolveChannel(
  preferred: MessageChannel,
  contact: ContactInfo,
): MessageChannel | undefined {
  const order = [preferred, ...FALLBACK_ORDER.filter((c) => c !== preferred)];
  return order.find((channel) => hasContactFor(channel, contact));
}
