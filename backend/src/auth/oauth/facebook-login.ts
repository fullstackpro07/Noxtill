import { HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';
import { AppException } from '../../common/filters/app.exception';
import type { ProviderProfile } from './oauth-providers';

/**
 * Facebook Login (auth spec §4.4). Only `public_profile` + `email` are requested — never pages,
 * ads, friends, posts or messages. The access token is validated server-side with `debug_token`
 * (app id + validity) before any profile field is trusted, and the email is never treated as
 * verified: Noxtill runs its own email verification for Facebook sign-ups.
 */
export const FACEBOOK_SCOPES = 'public_profile,email';

export function facebookVersion(raw?: string): string {
  const v = (raw ?? '').trim();
  return /^v\d+\.\d+$/.test(v) ? v : 'v19.0';
}

export function facebookAuthorizeUrl(p: {
  version: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    state: p.state,
    response_type: 'code',
    scope: FACEBOOK_SCOPES,
  });
  return `https://www.facebook.com/${p.version}/dialog/oauth?${params.toString()}`;
}

export async function facebookProfile(p: {
  version: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<ProviderProfile> {
  const graph = `https://graph.facebook.com/${p.version}`;
  const invalid = (why: string) =>
    new AppException(
      'PROVIDER_TOKEN_INVALID',
      `Facebook sign-in rejected (${why})`,
      HttpStatus.UNAUTHORIZED,
    );

  const tokenRes = await axios.get<{ access_token?: string }>(
    `${graph}/oauth/access_token`,
    {
      params: {
        client_id: p.clientId,
        client_secret: p.clientSecret,
        redirect_uri: p.redirectUri,
        code: p.code,
      },
      timeout: 10_000,
    },
  );
  const accessToken = tokenRes.data.access_token;
  if (!accessToken) throw invalid('no access token');

  const debug = await axios.get<{
    data?: {
      is_valid?: boolean;
      app_id?: string;
      user_id?: string;
      expires_at?: number;
    };
  }>(`${graph}/debug_token`, {
    params: {
      input_token: accessToken,
      access_token: `${p.clientId}|${p.clientSecret}`,
    },
    timeout: 10_000,
  });
  const info = debug.data.data;
  if (!info?.is_valid) throw invalid('token not valid');
  // Spec §4.3: expires_at must be in the future (0 would mean a non-expiring token — not a login token).
  if (!info.expires_at || info.expires_at * 1000 <= Date.now())
    throw invalid('token expired');
  if (String(info.app_id) !== p.clientId)
    throw invalid('issued to another app');
  if (!info.user_id) throw invalid('no user');

  const me = await axios.get<{ id?: string; name?: string; email?: string }>(
    `${graph}/me`,
    {
      params: {
        fields: 'id,name,email',
        access_token: accessToken,
        appsecret_proof: createHmac('sha256', p.clientSecret)
          .update(accessToken)
          .digest('hex'),
      },
      timeout: 10_000,
    },
  );
  if (!me.data.id || String(me.data.id) !== String(info.user_id)) {
    throw invalid('user mismatch');
  }
  return {
    provider: 'facebook',
    subject: String(me.data.id),
    email: me.data.email?.includes('@')
      ? me.data.email.toLowerCase()
      : undefined,
    emailVerified: false,
    name: me.data.name,
  };
}
