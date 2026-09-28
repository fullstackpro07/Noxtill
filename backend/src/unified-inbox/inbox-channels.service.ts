import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { INBOX_CHANNELS, InboxChannelDef, channelDef } from './inbox.constants';

/** Platforms whose social webhook is verified with the Facebook app secret (see `social-webhook.controller.ts`). */
const META_FAMILY = ['facebook', 'instagram', 'threads'];
/** Connectors whose `replyToInboxItem` cannot post (Snapchat has no public reply API). */
const NO_REPLY_PLATFORMS = ['snapchat'];

export interface Capability {
  ok: boolean;
  /** Plain sentence: how it works, or exactly what is missing. */
  how: string;
}

export interface ChannelState {
  key: string;
  def: InboxChannelDef;
  /** Connected | Sending only | Receiving only | Not receiving | Reconnect needed | Not connected | Not configured | Not available */
  st: string;
  handle: string;
  receive: Capability;
  send: Capability;
  cta: string | null;
  href: string | null;
}

/**
 * What each channel can really do right now — receive and send are judged separately, from the
 * same config and connection rows the webhook controllers and senders use. A connected account
 * whose inbound webhook is not configured delivers nothing, and is shown that way.
 */
@Injectable()
export class InboxChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private env(key: string) {
    return !!this.config.get<string>(key);
  }

  async states(businessId: string): Promise<Map<string, ChannelState>> {
    const [integration, accounts] = await Promise.all([
      this.prisma.integration.findUnique({
        where: { businessId_provider: { businessId, provider: 'whatsapp' } },
      }),
      this.prisma.socialAccount.findMany({ where: { businessId } }),
    ]);
    const map = new Map<string, ChannelState>();
    const keys = [
      ...new Set([
        ...INBOX_CHANNELS.map((c) => c.key),
        ...accounts.map((a) => a.platform as string),
      ]),
    ];

    for (const key of keys) {
      const def = channelDef(key);
      let handle = 'Not connected';
      let receive: Capability;
      let send: Capability;
      let cta: string | null = null;
      let href: string | null = null;
      let forced: string | null = null;

      if (key === 'whatsapp') {
        const meta = (integration?.meta ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
        const own =
          integration?.status === 'connected' && !integration.pausedAt;
        const shared =
          this.env('META_WA_TOKEN') && this.env('META_WA_PHONE_ID');
        href = '/integrations/whatsapp';
        if (integration?.status === 'needs_attention') {
          forced = 'Reconnect needed';
          cta = 'Reconnect';
        } else
          cta = own ? 'Manage' : shared ? 'Use your own number' : 'Connect';
        handle = own
          ? (str(meta.displayPhoneNumber) ??
            str(meta.verifiedName) ??
            'Your WhatsApp Business number')
          : shared
            ? 'Noxtill shared number'
            : 'No WhatsApp number';
        send = own
          ? {
              ok: true,
              how: 'Replies go out from your own WhatsApp Business number.',
            }
          : integration?.pausedAt
            ? {
                ok: shared,
                how: shared
                  ? 'Your own number is paused, so replies use the Noxtill shared number.'
                  : 'Your WhatsApp number is paused.',
              }
            : shared
              ? {
                  ok: true,
                  how: 'Replies go out from the Noxtill shared number.',
                }
              : {
                  ok: false,
                  how: 'No WhatsApp number is connected, so nothing can be sent.',
                };
        const meta2 = this.env('META_APP_SECRET');
        const telnyx = this.env('TELNYX_PUBLIC_KEY');
        receive =
          meta2 || telnyx
            ? {
                ok: true,
                how: `Customer messages arrive through the ${meta2 ? 'WhatsApp (Meta)' : 'Telnyx'} webhook.${own ? '' : ' On the shared number, only messages from phone numbers already saved as customers can be matched to your business.'}`,
              }
            : {
                ok: false,
                how: 'The WhatsApp webhook is not configured on this server (META_APP_SECRET), so incoming messages cannot arrive.',
              };
      } else if (key === 'sms') {
        const sendOk =
          this.env('TWILIO_ACCOUNT_SID') &&
          this.env('TWILIO_AUTH_TOKEN') &&
          this.env('TWILIO_FROM_NUMBER');
        handle = sendOk
          ? String(this.config.get('TWILIO_FROM_NUMBER'))
          : 'No sending number set up';
        send = sendOk
          ? { ok: true, how: 'Replies go out by SMS from the platform number.' }
          : {
              ok: false,
              how: 'No SMS provider is set up on this server, so texts cannot be sent.',
            };
        receive = this.env('TELNYX_PUBLIC_KEY')
          ? {
              ok: true,
              how: 'Incoming texts arrive through the Telnyx webhook and are matched to a customer by phone number; a text from an unknown number cannot be tied to your business.',
            }
          : {
              ok: false,
              how: 'The incoming SMS webhook is not configured on this server (TELNYX_PUBLIC_KEY), so texts cannot arrive.',
            };
      } else if (key === 'email') {
        const sendOk =
          this.env('EMAIL_PROVIDER_KEY') && this.env('EMAIL_FROM_ADDRESS');
        handle = sendOk
          ? String(this.config.get('EMAIL_FROM_ADDRESS'))
          : 'No sending address set up';
        send = sendOk
          ? { ok: true, how: 'Messages go out from your sending address.' }
          : {
              ok: false,
              how: 'No email provider is set up on this server, so email cannot be sent.',
            };
        receive = {
          ok: false,
          how: 'Noxtill does not receive email, so email conversations only start from here.',
        };
      } else if (def.transport === 'social') {
        const acc = accounts.find((a) => a.platform === key);
        href = '/social/accounts';
        handle = acc?.externalAccountName ?? 'Not connected';
        if (acc?.status === 'needs_attention') {
          forced = 'Reconnect needed';
          cta = 'Reconnect';
        } else if (acc?.status === 'connected') cta = 'Manage';
        else {
          forced = 'Not connected';
          cta = 'Connect';
        }
        const connected = acc?.status === 'connected';
        const webhookKey = META_FAMILY.includes(key)
          ? 'FACEBOOK_APP_SECRET'
          : `SOCIAL_${key.toUpperCase()}_VERIFY_TOKEN`;
        const hook = this.env(webhookKey);
        receive = !connected
          ? { ok: false, how: `${def.short} is not connected in Social.` }
          : hook
            ? {
                ok: true,
                how: `Messages arrive through the ${def.short} webhook.`,
              }
            : {
                ok: false,
                how: `The account is connected, but the ${def.short} webhook is not configured on this server (${webhookKey}), so nothing arrives.`,
              };
        send = !connected
          ? { ok: false, how: `${def.short} is not connected in Social.` }
          : NO_REPLY_PLATFORMS.includes(key)
            ? {
                ok: false,
                how: `${def.short} has no public API for replying, so replies cannot be posted from Noxtill.`,
              }
            : {
                ok: true,
                how: `Replies are posted back through the ${def.short} connection.`,
              };
      } else {
        handle = 'Not available';
        receive = { ok: false, how: def.note };
        send = { ok: false, how: def.note };
        forced = 'Not available';
      }

      const st =
        forced ??
        (key !== 'whatsapp' &&
        key !== 'sms' &&
        key !== 'email' &&
        !receive.ok &&
        !send.ok
          ? 'Not connected'
          : receive.ok && send.ok
            ? 'Connected'
            : send.ok
              ? 'Sending only'
              : receive.ok
                ? 'Receiving only'
                : key === 'whatsapp' || key === 'sms' || key === 'email'
                  ? 'Not configured'
                  : 'Not receiving');
      map.set(key, { key, def, st, handle, receive, send, cta, href });
    }
    return map;
  }

  async state(businessId: string, key: string): Promise<ChannelState> {
    return (await this.states(businessId)).get(key)!;
  }
}
