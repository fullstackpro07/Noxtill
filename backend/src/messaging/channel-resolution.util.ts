import { MessageChannel } from '@prisma/client';

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
 * fall back through a configurable channel-priority order, picking the
 * first channel the customer actually has contact info for.
 *
 * Messages & Channels, configurable (UPD-BE-118): `businessFallbackOrder` is the business's own
 * real `channelPriority` setting; an empty/missing array (every pre-existing business, and any
 * new one that never touches this setting) keeps the exact original hardcoded whatsapp→sms→email
 * order — fully backward-compatible.
 */
export function resolveChannel(
  preferred: MessageChannel,
  contact: ContactInfo,
  businessFallbackOrder?: MessageChannel[],
): MessageChannel | undefined {
  const fallback =
    businessFallbackOrder && businessFallbackOrder.length > 0
      ? businessFallbackOrder
      : FALLBACK_ORDER;
  const order = [preferred, ...fallback.filter((c) => c !== preferred)];
  return order.find((channel) => hasContactFor(channel, contact));
}
