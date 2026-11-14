import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  buildAuthKit,
  cleanupUsers,
  resetRateLimits,
  type AuthKit,
} from '../testing/auth-test-kit';
import { defaultLabel, PasskeysService } from './passkeys.service';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) =>
      e instanceof AppException
        ? (e.getResponse() as { code: string }).code
        : String(e),
  );

/**
 * Passkeys (spec §5) on real MySQL — registration options, challenge discipline, scoping and the
 * removal guards. Full signed assertions (counter rule, replay, origin) are exercised with a
 * software authenticator in `auth-security.acceptance.spec.ts`.
 */
describe('Passkeys (integration)', () => {
  const ts = Date.now();
  const prefix = `pk-${ts}-`;
  let prisma: PrismaService;
  let kit: AuthKit;
  let disabled: PasskeysService;
  const users: AuthenticatedUser[] = [];
  const meta = {
    ipAddress: '198.18.0.1',
    userAgent: 'jest',
    deviceId: `d-${ts}`,
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await resetRateLimits(prisma);
    kit = buildAuthKit(prisma, { AUTH_PASSKEYS_ENABLED: 'true' });
    disabled = new PasskeysService(
      prisma,
      new ConfigService({}),
      kit.auth,
      kit.methods,
      kit.sessions,
      kit.mfa,
      kit.rateLimit,
    );
    for (const [tag, owner] of [
      ['a', true],
      ['b', false],
    ] as const) {
      const res = await kit.auth.signup(
        {
          email: `${prefix}${tag}@example.com`,
          password: 'a long passphrase here',
        },
        meta,
      );
      await prisma.user.update({
        where: { id: res.user.id },
        data: { emailVerifiedAt: new Date() },
      });
      if (!owner) {
        await prisma.businessUser.updateMany({
          where: { userId: res.user.id },
          data: { role: 'manager' },
        });
        await prisma.user.update({
          where: { id: res.user.id },
          data: { mfaRequired: false },
        });
      }
      users.push({
        sub: res.user.id,
        businessId: res.business.id,
        role: owner ? 'owner' : 'manager',
        capabilities: [],
        sessionId: res.tokens.sessionId,
      });
    }
  });

  afterAll(async () => {
    await cleanupUsers(prisma, prefix);
    await prisma.webAuthnChallenge.deleteMany({
      where: { userId: null, createdAt: { gte: new Date(ts - 60_000) } },
    });
    await prisma.$disconnect();
  });

  it('is unavailable unless AUTH_PASSKEYS_ENABLED is on', async () => {
    expect(await codeOf(disabled.authenticationOptions())).toBe(
      'PROVIDER_NOT_CONFIGURED',
    );
  });

  it('RP ID and origin come from the frontend URL by default', () => {
    expect(kit.passkeys.rp()).toEqual({
      rpID: 'app.example.com',
      rpName: 'Noxtill',
      origins: ['https://app.example.com'],
    });
  });

  it('registration needs fresh auth; user.id is 64 random bytes; UV required for owners, preferred otherwise', async () => {
    const [owner, manager] = users;
    await prisma.session.update({
      where: { id: owner.sessionId! },
      data: { createdAt: new Date(Date.now() - 3_600_000) },
    });
    expect(await codeOf(kit.passkeys.registrationOptions(owner))).toBe(
      'REAUTH_REQUIRED',
    );
    expect(await codeOf(kit.passkeys.registrationOptions(owner, 'nope'))).toBe(
      'INVALID_PASSWORD',
    );
    const ok = await kit.passkeys.registrationOptions(
      owner,
      'a long passphrase here',
    );
    expect(ok.options.rp.id).toBe('app.example.com');
    expect(ok.options.attestation).toBe('none');
    expect(ok.options.authenticatorSelection).toMatchObject({
      residentKey: 'preferred',
      userVerification: 'required',
    });
    expect(ok.options.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -257]);
    const handle = Buffer.from(ok.options.user.id, 'base64url');
    expect(handle.length).toBe(64);
    expect(handle.toString('utf8')).not.toContain(owner.sub);
    const mgr = await kit.passkeys.registrationOptions(manager);
    expect(mgr.options.authenticatorSelection?.userVerification).toBe(
      'preferred',
    );
  });

  it('a registration challenge is bound to its user and single-use', async () => {
    const [a, b] = users;
    await prisma.session.update({
      where: { id: a.sessionId! },
      data: { createdAt: new Date() },
    });
    const { challengeId } = await kit.passkeys.registrationOptions(a);
    const junk = {
      id: 'x',
      rawId: 'x',
      type: 'public-key',
      response: {},
      clientExtensionResults: {},
    } as never;
    expect(
      await codeOf(
        kit.passkeys.registrationVerify(b, challengeId, junk, undefined, meta),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');
    expect(
      await codeOf(
        kit.passkeys.registrationVerify(a, challengeId, junk, undefined, meta),
      ),
    ).toBe('PASSKEY_REJECTED');
    expect(
      await codeOf(
        kit.passkeys.registrationVerify(a, challengeId, junk, undefined, meta),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');
  });

  it('expired challenges and unknown or mismatched credentials are rejected', async () => {
    const [a, b] = users;
    const { challengeId } = await kit.passkeys.authenticationOptions();
    const unknown = {
      id: 'unknown-cred',
      rawId: 'unknown-cred',
      type: 'public-key',
      response: {},
      clientExtensionResults: {},
    } as never;
    expect(
      await codeOf(
        kit.passkeys.authenticationVerify(challengeId, unknown, meta),
      ),
    ).toBe('PASSKEY_REJECTED');

    const second = await kit.passkeys.authenticationOptions();
    await prisma.webAuthnChallenge.update({
      where: { id: second.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      await codeOf(
        kit.passkeys.authenticationVerify(second.challengeId, unknown, meta),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');

    await prisma.passkeyCredential.create({
      data: {
        userId: a.sub,
        credentialId: `cred-${ts}-a`,
        publicKey: Buffer.from([1]),
        deviceType: 'singleDevice',
        label: 'A',
        transports: [],
      },
    });
    const third = await kit.passkeys.authenticationOptions();
    const mismatched = {
      id: `cred-${ts}-a`,
      rawId: `cred-${ts}-a`,
      type: 'public-key',
      response: {
        userHandle: Buffer.from(b.sub, 'utf8').toString('base64url'),
      },
      clientExtensionResults: {},
    } as never;
    expect(
      await codeOf(
        kit.passkeys.authenticationVerify(third.challengeId, mismatched, meta),
      ),
    ).toBe('PASSKEY_REJECTED');
  });

  it('management is scoped to the owner, and an owner can’t remove their only second factor', async () => {
    const [a, b] = users;
    const only = await prisma.passkeyCredential.findFirstOrThrow({
      where: { userId: a.sub },
    });
    expect(await codeOf(kit.passkeys.rename(b.sub, only.id, 'Mine now'))).toBe(
      'NOT_FOUND',
    );
    await prisma.session.update({
      where: { id: b.sessionId! },
      data: { createdAt: new Date() },
    });
    expect(await codeOf(kit.passkeys.remove(b, only.id))).toBe('NOT_FOUND');
    expect(await kit.passkeys.list(b.sub)).toHaveLength(0);

    await kit.mfa.sync(a.sub);
    expect(await codeOf(kit.passkeys.remove(a, only.id))).toBe('MFA_REQUIRED');
    const second = await prisma.passkeyCredential.create({
      data: {
        userId: a.sub,
        credentialId: `cred-${ts}-2`,
        publicKey: Buffer.from([2]),
        deviceType: 'multiDevice',
        label: 'B',
        transports: [],
      },
    });
    await expect(kit.passkeys.remove(a, only.id)).resolves.toMatchObject({
      removed: true,
    });
    // Removing a sign-in method ends every session (spec §9.3).
    expect(
      await prisma.session.count({ where: { userId: a.sub, revokedAt: null } }),
    ).toBe(0);
    await expect(
      kit.passkeys.rename(a.sub, second.id, '  Work   laptop '),
    ).resolves.toEqual({ id: second.id, label: 'Work laptop' });
    expect(await kit.passkeys.list(a.sub)).toEqual([
      expect.objectContaining({ label: 'Work laptop', synced: true }),
    ]);
  });

  it('default labels come from the user agent only', () => {
    expect(defaultLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'Passkey on Windows',
    );
    expect(
      defaultLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
    ).toBe('Passkey on iPhone');
    expect(defaultLabel(undefined)).toBe('Passkey');
  });
});
