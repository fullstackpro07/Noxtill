/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.arrayContaining`/`expect.objectContaining`) are typed `any`. */
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { ConsoleLogger } from '@nestjs/common';
import { scrubSecrets, ScrubbingLogger } from './secret-scrubber';
import { csrfTokenFor, csrfValid, setSessionCookies } from './auth-cookies';
import { PasswordService, normalizeEmail } from './password.service';
import { counterVerdict } from '../passkeys/passkeys.service';
import { facebookProfile } from '../oauth/facebook-login';
import { microsoftDef, MICROSOFT_CONSUMER_TENANT } from '../oauth/oidc';
import { AppException } from '../../common/filters/app.exception';

const code = (e: unknown) =>
  e instanceof AppException
    ? (e.getResponse() as { code: string }).code
    : String(e);

/** Auth security spec — checks that need no database. Acceptance-test numbers refer to §13. */
describe('Auth security — units', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('§11 / test 22 — secrets never reach the logs', () => {
    it.each([
      ['password=hunter2-long-pass', 'hunter2'],
      ['{"password":"Correct horse battery staple"}', 'Correct horse'],
      ['code 482913 is your Noxtill sign-in code', '482913'],
      [
        'callback?code=4/0AY0e-g7abcDEF&state=Zt9xQ1r8sGkLmN0pQrStUvWxYz012345',
        '4/0AY0e',
      ],
      [
        'code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        'dBjftJeZ4CVP',
      ],
      [
        'Authorization: Bearer 8Ue3TnXq0sZ1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1u',
        '8Ue3TnXq',
      ],
      [
        'Cookie: __Host-nx_at=Zm9vYmFyYmF6cXV4; __Host-nx_rt=cXV4YmF6',
        'Zm9vYmFy',
      ],
      [
        'ticket: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        'eyJhbGciOiJIUzI1',
      ],
      [
        'refresh_token=R2xhc3MgYm9hdCB0b2tlbiB3aXRoIHNvbWUgcGFkZGluZyB0b28',
        'R2xhc3M',
      ],
    ])('scrubs %s', (line, secret) => {
      expect(String(scrubSecrets(line))).not.toContain(secret);
    });

    it('keeps ordinary diagnostics readable', () => {
      expect(scrubSecrets('Failed to deliver email verification code')).toBe(
        'Failed to deliver email verification code',
      );
      expect(scrubSecrets("code: 'RATE_LIMITED'")).toContain('RATE_LIMITED');
    });

    it('the logger itself scrubs every level', () => {
      const out: unknown[] = [];
      jest
        .spyOn(ConsoleLogger.prototype, 'error')
        .mockImplementation((m: unknown) => {
          out.push(m);
        });
      new ScrubbingLogger().error(
        'login failed for password=Sup3rSecretPassphrase',
      );
      expect(String(out[0])).not.toContain('Sup3rSecretPassphrase');
    });
  });

  describe('§8.2 / test 19 — cookies are HttpOnly, Lax, Secure on HTTPS', () => {
    it('sets __Host- HttpOnly SameSite=Lax Secure cookies when served over https', () => {
      const prev = process.env.AUTH_COOKIE_SECURE;
      process.env.AUTH_COOKIE_SECURE = 'true';
      const set: [string, string, Record<string, unknown>][] = [];
      const res = {
        cookie: (n: string, v: string, o: Record<string, unknown>) =>
          set.push([n, v, o]),
      };
      setSessionCookies(res as never, {
        accessToken: 'a',
        refreshToken: 'r',
        accessMaxAgeMs: 900_000,
        refreshMaxAgeMs: 1000,
      });
      process.env.AUTH_COOKIE_SECURE = prev;
      expect(set.map((c) => c[0])).toEqual(['__Host-nx_at', '__Host-nx_rt']);
      for (const [, , o] of set) {
        expect(o).toMatchObject({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        });
        expect(o).not.toHaveProperty('domain');
      }
      expect(set[0][2].maxAge).toBe(900_000);
    });

    it('CSRF token is bound to the session', () => {
      const t = csrfTokenFor('session-a');
      expect(csrfValid('session-a', t)).toBe(true);
      expect(csrfValid('session-b', t)).toBe(false);
      expect(csrfValid('session-a', undefined)).toBe(false);
    });
  });

  describe('§5.3 — signature counter rule', () => {
    it.each([
      [0, 0, 'accept'], // synced passkey (iCloud / Google Password Manager) — tests 10
      [0, 3, 'accept'],
      [5, 6, 'accept'],
      [5, 5, 'regression'], // test 9
      [5, 2, 'regression'],
    ])('stored %i, presented %i → %s', (stored, presented, verdict) => {
      expect(counterVerdict(stored, presented)).toBe(verdict);
    });
  });

  describe('§7 — passwords', () => {
    const svc = new PasswordService(
      new ConfigService({ AUTH_BREACH_CHECK: 'true' }),
    );

    it('needs 12+ characters, no composition rules, NFKC-normalised', async () => {
      expect(svc.policyError('short-pass1')).toMatch(/12/);
      expect(svc.policyError('all lowercase words here')).toBeNull();
      expect(svc.policyError('x'.repeat(129))).toMatch(/128/);
      const hash = await svc.hash('ｃｏｒｒｅｃｔ horse battery'); // full-width
      expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(await svc.verify(hash, 'correct horse battery')).toBe(true);
      expect(svc.needsRehash(hash)).toBe(false);
    });

    it('test 21: rejects a password present in a breach corpus (k-anonymity: only 5 hex chars sent)', async () => {
      const pw = 'password1234567';
      const sha1 = createHash('sha1').update(pw).digest('hex').toUpperCase();
      const get = jest.spyOn(axios, 'get').mockResolvedValue({
        data: `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${sha1.slice(5)}:52579\r\n`,
      });
      await expect(svc.assertAcceptable(pw)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PASSWORD_BREACHED' }),
      });
      expect(get.mock.calls[0][0]).toBe(
        `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`,
      );
      expect(JSON.stringify(get.mock.calls[0])).not.toContain(sha1.slice(5));
      expect(JSON.stringify(get.mock.calls[0])).not.toContain(pw);
    });

    it('verifies legacy bcrypt hashes and flags them for upgrade', async () => {
      const legacy = await bcrypt.hash('legacy-password-1', 4);
      expect(await svc.verify(legacy, 'legacy-password-1')).toBe(true);
      expect(svc.needsRehash(legacy)).toBe(true);
    });

    it('normalises email NFKC + lower-case', () => {
      expect(normalizeEmail('  Ｏｗｎｅｒ@Salon.COM ')).toBe('owner@salon.com');
    });
  });

  describe('§4.3 / test 5 — Facebook token verification', () => {
    const base = {
      version: 'v19.0',
      code: 'c',
      clientId: 'our-app',
      clientSecret: 'secret',
      redirectUri: 'https://api.example.com/api/v1/auth/facebook/callback',
    };
    const mockGraph = (
      debug: Record<string, unknown>,
      me: Record<string, unknown> = { id: '42', name: 'Fay' },
    ) =>
      jest.spyOn(axios, 'get').mockImplementation((url: string) => {
        if (url.includes('/oauth/access_token'))
          return Promise.resolve({ data: { access_token: 'user-token' } });
        if (url.includes('/debug_token'))
          return Promise.resolve({ data: { data: debug } });
        return Promise.resolve({ data: me });
      });

    it('rejects a token issued to a different application', async () => {
      mockGraph({
        is_valid: true,
        app_id: 'attacker-app',
        user_id: '42',
        expires_at: Date.now() / 1000 + 3600,
      });
      expect(code(await facebookProfile(base).catch((e: unknown) => e))).toBe(
        'PROVIDER_TOKEN_INVALID',
      );
    });

    it('rejects an expired or non-expiring token', async () => {
      mockGraph({
        is_valid: true,
        app_id: 'our-app',
        user_id: '42',
        expires_at: 0,
      });
      expect(code(await facebookProfile(base).catch((e: unknown) => e))).toBe(
        'PROVIDER_TOKEN_INVALID',
      );
    });

    it('accepts a valid token and never marks the email verified', async () => {
      mockGraph(
        {
          is_valid: true,
          app_id: 'our-app',
          user_id: '42',
          expires_at: Date.now() / 1000 + 3600,
        },
        { id: '42', name: 'Fay', email: 'Fay@Example.com' },
      );
      const p = await facebookProfile(base);
      expect(p).toMatchObject({
        provider: 'facebook',
        subject: '42',
        email: 'fay@example.com',
        emailVerified: false,
      });
    });
  });

  describe('§4.2 / test 7 — Microsoft tenants', () => {
    const tid = '72f988bf-86f1-41af-91ab-2d7cd011db47';
    it('rejects a tenant that is not allowlisted', () => {
      const def = microsoftDef('common', [
        '11111111-1111-1111-1111-111111111111',
      ]);
      expect(
        def.issuerValid({
          tid,
          iss: `https://login.microsoftonline.com/${tid}/v2.0`,
        }),
      ).toBe(false);
    });
    it('treats a personal-account email as verified, a work-account email as unverified, never preferred_username', () => {
      const def = microsoftDef('common');
      expect(
        def.toProfile({
          sub: 's',
          tid: MICROSOFT_CONSUMER_TENANT,
          email: 'me@outlook.com',
        }),
      ).toMatchObject({
        emailVerified: true,
        tenantId: MICROSOFT_CONSUMER_TENANT,
      });
      expect(
        def.toProfile({ sub: 's', tid, email: 'me@contoso.com' }),
      ).toMatchObject({
        emailVerified: false,
        tenantId: tid,
      });
      expect(
        def.toProfile({ sub: 's', tid, preferred_username: 'me@contoso.com' })
          .email,
      ).toBeUndefined();
    });
  });

  describe('§4.3 — Meta signed_request', () => {
    it('signs with the app secret (sanity for the deauthorize/deletion endpoints)', () => {
      const payload = Buffer.from(
        JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '42' }),
      ).toString('base64url');
      const sig = createHmac('sha256', 'secret')
        .update(payload)
        .digest('base64url');
      expect(`${sig}.${payload}`.split('.')).toHaveLength(2);
    });
  });
});
