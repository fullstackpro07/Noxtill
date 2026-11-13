import { ConfigService } from '@nestjs/config';

/** External sign-in providers (auth spec §4). LinkedIn and ChatGPT are out of scope by decision. */
export const SOCIAL_PROVIDERS = ['google', 'microsoft', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(p: string): p is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(p);
}

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
};

/** What a provider proved about the person, after server-side validation. */
export interface ProviderProfile {
  provider: SocialProvider;
  /** Stable provider subject — the identity key (never the email). */
  subject: string;
  email?: string;
  /** True only on a reliable provider claim (Google `email_verified`); Microsoft/Facebook: false. */
  emailVerified: boolean;
  name?: string;
}

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function flag(config: ConfigService, key: string, fallback: boolean) {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** Client credentials, read server-side only (never `NEXT_PUBLIC_`). Null when not configured. */
export function providerCredentials(
  config: ConfigService,
  provider: SocialProvider,
): Credentials | null {
  const pick = (...keys: string[]) =>
    keys.map((k) => config.get<string>(k)).find((v) => v && v.trim()) ?? '';
  let clientId = '';
  let clientSecret = '';
  if (provider === 'google') {
    // Existing deployments use GOOGLE_OAUTH_*; the spec's GOOGLE_CLIENT_* names also work.
    clientId = pick('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_CLIENT_ID');
    clientSecret = pick('GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
  } else if (provider === 'microsoft') {
    clientId = pick('MICROSOFT_CLIENT_ID');
    clientSecret = pick('MICROSOFT_CLIENT_SECRET');
  } else {
    // Same Meta app as the Social inbox connector unless a login-only app is configured.
    clientId = pick('FACEBOOK_LOGIN_APP_ID', 'FACEBOOK_APP_ID');
    clientSecret = pick('FACEBOOK_LOGIN_APP_SECRET', 'FACEBOOK_APP_SECRET');
  }
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * A provider is offered only when its feature flag is on AND credentials exist (auth spec §10).
 * Google defaults on so the already-working Google sign-in doesn't regress; every new method
 * defaults off until it has been configured and tested with real accounts.
 */
export function providerEnabled(
  config: ConfigService,
  provider: SocialProvider,
): boolean {
  const flags: Record<SocialProvider, [string, boolean]> = {
    google: ['AUTH_GOOGLE_ENABLED', true],
    microsoft: ['AUTH_MICROSOFT_ENABLED', false],
    facebook: ['AUTH_FACEBOOK_ENABLED', false],
  };
  const [key, fallback] = flags[provider];
  return flag(config, key, fallback) && !!providerCredentials(config, provider);
}

export function passkeysEnabled(config: ConfigService): boolean {
  return flag(config, 'AUTH_PASSKEYS_ENABLED', false);
}

export function backendUrl(config: ConfigService): string {
  return (
    config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1'
  ).replace(/\/$/, '');
}

export function frontendUrl(config: ConfigService): string {
  return (
    config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** The exact callback registered with each provider console. */
export function callbackUrl(
  config: ConfigService,
  provider: SocialProvider,
): string {
  return `${backendUrl(config)}/auth/${provider}/callback`;
}
