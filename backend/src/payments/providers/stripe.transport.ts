import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import type { PayEnv } from '../payments.constants';

export const STRIPE_TRANSPORT = Symbol('STRIPE_TRANSPORT');
const API = 'https://api.stripe.com/v1';

export type StripeParams = Record<string, unknown>;

export interface StripeCall {
  env: PayEnv;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  params?: StripeParams;
  /** Connected account (acct_…) the call acts on. */
  account: string;
  idempotencyKey?: string;
  timeoutMs?: number;
}

/** Thrown when the provider didn't answer in time: the outcome is unknown, never assumed. */
export class ProviderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

/** A provider answered with an error (decline, invalid request, …). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface StripeTransport {
  /** Is a platform key configured for this mode? */
  configured(env: PayEnv): boolean;
  request<T = Record<string, unknown>>(call: StripeCall): Promise<T>;
}

/** Stripe's form encoding: nested objects as a[b]=c, arrays as a[0]=x. */
export function encodeForm(params: StripeParams, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null) out.push(`${encodeURIComponent(key)}=`);
    else if (Array.isArray(v))
      v.forEach((x, i) => {
        if (x !== null && typeof x === 'object')
          out.push(...encodeForm(x as StripeParams, `${key}[${i}]`));
        else
          out.push(
            `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`,
          );
      });
    else if (typeof v === 'object')
      out.push(...encodeForm(v as StripeParams, key));
    else
      out.push(
        `${encodeURIComponent(key)}=${
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- scalars only in this branch
          encodeURIComponent(String(v))
        }`,
      );
  }
  return out;
}

/**
 * The real transport: Stripe's REST API with the platform secret key for the connection's mode
 * (live → STRIPE_SECRET_KEY, test → STRIPE_TEST_SECRET_KEY) acting on the merchant's connected
 * account through the Stripe-Account header. Writes carry an Idempotency-Key so a retry after a
 * timeout replays Stripe's original result instead of moving money twice.
 */
@Injectable()
export class HttpStripeTransport implements StripeTransport {
  constructor(private readonly config: ConfigService) {}

  private key(env: PayEnv): string {
    const k =
      (env === 'test'
        ? this.config.get<string>('STRIPE_TEST_SECRET_KEY')
        : this.config.get<string>('STRIPE_SECRET_KEY')) ?? '';
    if (k && env === 'live' && k.startsWith('sk_test_'))
      throw new ProviderError(
        'STRIPE_SECRET_KEY is a test key — live payments are refused.',
        'KEY_MODE_MISMATCH',
        500,
      );
    if (k && env === 'test' && k.startsWith('sk_live_'))
      throw new ProviderError(
        'STRIPE_TEST_SECRET_KEY is a live key — test mode is refused.',
        'KEY_MODE_MISMATCH',
        500,
      );
    return k;
  }

  configured(env: PayEnv): boolean {
    try {
      return !!this.key(env);
    } catch {
      return false;
    }
  }

  async request<T>(c: StripeCall): Promise<T> {
    const key = this.key(c.env);
    if (!key)
      throw new ProviderError(
        `Stripe ${c.env} mode isn’t configured on this Noxtill server.`,
        'NOT_CONFIGURED',
        503,
      );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      'Stripe-Account': c.account,
    };
    if (c.idempotencyKey) headers['Idempotency-Key'] = c.idempotencyKey;
    const body = c.params ? encodeForm(c.params).join('&') : '';
    try {
      const res = await axios.request<T>({
        url: `${API}${c.path}${c.method === 'GET' && body ? `?${body}` : ''}`,
        method: c.method,
        headers:
          c.method === 'GET'
            ? headers
            : {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
        data: c.method === 'GET' ? undefined : body,
        timeout: c.timeoutMs ?? 20000,
      });
      return res.data;
    } catch (e) {
      const ax = e as AxiosError<{
        error?: {
          code?: string;
          decline_code?: string;
          message?: string;
          type?: string;
        };
      }>;
      if (
        ax.code === 'ECONNABORTED' ||
        ax.code === 'ETIMEDOUT' ||
        ax.code === 'ECONNRESET' ||
        (!ax.response && ax.request)
      )
        throw new ProviderTimeoutError(
          `Stripe didn’t answer (${ax.code ?? 'network'}).`,
        );
      const err = ax.response?.data?.error;
      throw new ProviderError(
        err?.message ?? ax.message,
        err?.decline_code ?? err?.code ?? err?.type ?? 'stripe_error',
        ax.response?.status ?? 500,
        err,
      );
    }
  }
}

/**
 * Stripe webhook signature check (scheme v1): HMAC-SHA256 over "<t>.<payload>" with the endpoint
 * secret, compared in constant time, with a 5-minute tolerance against replays.
 */
export function verifyStripeSignature(
  payload: Buffer | string,
  header: string,
  secret: string,
  toleranceSec = 300,
  now = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec)
    return false;
  const sigs = header
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  const expected = createHmac('sha256', secret)
    .update(
      `${t}.${typeof payload === 'string' ? payload : payload.toString('utf8')}`,
    )
    .digest('hex');
  return sigs.some(
    (s) =>
      s.length === expected.length &&
      timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
}

/** Header a sender would produce — used by specs and the Stripe CLI-compatible test path. */
export function signStripePayload(
  payload: string,
  secret: string,
  t = Math.floor(Date.now() / 1000),
): string {
  const v1 = createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}
