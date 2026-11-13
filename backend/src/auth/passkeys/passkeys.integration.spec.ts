import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import type { AuthService } from '../auth.service';
import { SignInMethodsService } from '../sign-in-methods.service';
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
 * Passkeys (auth spec §4.3 / §8.2 / §11.3) against real MySQL. Real authenticator ceremonies need a
 * browser; these cover everything Noxtill itself enforces around the library's verification:
 * fresh-auth, challenge single-use/expiry/binding, unknown credentials, the last-method guard and
 * per-user scoping.
 */
describe('Passkeys (integration)', () => {
  const ts = Date.now();
  let prisma: PrismaService;
  let passkeys: PasskeysService;
  let disabled: PasskeysService;
  const users: AuthenticatedUser[] = [];
  const businessIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = new ConfigService({
      AUTH_PASSKEYS_ENABLED: 'true',
      FRONTEND_URL: 'https://app.example.com',
    });
    const methods = new SignInMethodsService(prisma);
    const auth = { completeLogin: jest.fn() } as unknown as AuthService;
    passkeys = new PasskeysService(prisma, config, auth, methods);
    disabled = new PasskeysService(
      prisma,
      new ConfigService({}),
      auth,
      methods,
    );

    for (const tag of ['a', 'b']) {
      const business = await prisma.business.create({
        data: { name: 'PK', slug: `pk-${ts}-${tag}` },
      });
      businessIds.push(business.id);
      const passwordHash = await bcrypt.hash('Secret123!', 4);
      // Unverified email, no provider: passkeys are the only extra way in.
      const user = await prisma.user.create({
        data: {
          name: 'PK',
          email: `pk-${ts}-${tag}@example.com`,
          passwordHash,
          emailVerifiedAt: null,
        },
      });
      await prisma.businessUser.create({
        data: { businessId: business.id, userId: user.id, role: 'owner' },
      });
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          businessId: business.id,
          refreshTokenHash: 'x',
        },
      });
      users.push({
        sub: user.id,
        businessId: business.id,
        role: 'owner',
        capabilities: [],
        sessionId: session.id,
      });
    }
  });

  afterAll(async () => {
    const ids = users.map((u) => u.sub);
    await prisma.webAuthnChallenge.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.webAuthnChallenge.deleteMany({
      where: { userId: null, createdAt: { gte: new Date(ts - 60_000) } },
    });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.businessUser.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  it('is unavailable unless AUTH_PASSKEYS_ENABLED is on', async () => {
    expect(await codeOf(disabled.authenticationOptions())).toBe(
      'PROVIDER_NOT_CONFIGURED',
    );
  });

  it('RP ID and origin come from the frontend URL by default', () => {
    expect(passkeys.rp()).toEqual({
      rpID: 'app.example.com',
      rpName: 'Noxtill',
      origins: ['https://app.example.com'],
    });
  });

  it('adding a passkey requires fresh authentication', async () => {
    const [a] = users;
    await prisma.session.update({
      where: { id: a.sessionId! },
      data: { createdAt: new Date(Date.now() - 3_600_000) },
    });
    expect(await codeOf(passkeys.registrationOptions(a))).toBe(
      'REAUTH_REQUIRED',
    );
    expect(await codeOf(passkeys.registrationOptions(a, 'nope'))).toBe(
      'INVALID_PASSWORD',
    );
    const ok = await passkeys.registrationOptions(a, 'Secret123!');
    expect(ok.options.rp.id).toBe('app.example.com');
    expect(ok.options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
    expect(Buffer.from(ok.options.user.id, 'base64url').toString('utf8')).toBe(
      a.sub,
    );
  });

  it('a registration challenge is bound to its user and single-use', async () => {
    const [a, b] = users;
    await prisma.session.update({
      where: { id: a.sessionId! },
      data: { createdAt: new Date() },
    });
    const { challengeId } = await passkeys.registrationOptions(a);
    const junk = {
      id: 'x',
      rawId: 'x',
      type: 'public-key',
      response: {},
      clientExtensionResults: {},
    } as never;
    // Another user can't redeem it.
    expect(
      await codeOf(
        passkeys.registrationVerify(b, challengeId, junk, undefined, {}),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');
    // The owner's attempt consumes it (the junk response itself is then rejected by the library)…
    expect(
      await codeOf(
        passkeys.registrationVerify(a, challengeId, junk, undefined, {}),
      ),
    ).toBe('PASSKEY_REJECTED');
    // …so it can never be replayed.
    expect(
      await codeOf(
        passkeys.registrationVerify(a, challengeId, junk, undefined, {}),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');
  });

  it('an expired sign-in challenge is refused, and an unknown credential is rejected', async () => {
    const { challengeId } = await passkeys.authenticationOptions();
    const response = {
      id: 'unknown-cred',
      rawId: 'unknown-cred',
      type: 'public-key',
      response: { userHandle: undefined },
      clientExtensionResults: {},
    } as never;
    expect(
      await codeOf(passkeys.authenticationVerify(challengeId, response, {})),
    ).toBe('PASSKEY_REJECTED');

    const second = await passkeys.authenticationOptions();
    await prisma.webAuthnChallenge.update({
      where: { id: second.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      await codeOf(
        passkeys.authenticationVerify(second.challengeId, response, {}),
      ),
    ).toBe('PASSKEY_CHALLENGE_INVALID');
  });

  it("a passkey's userHandle must match its stored owner", async () => {
    const [a, b] = users;
    await prisma.passkeyCredential.create({
      data: {
        userId: a.sub,
        credentialId: `cred-${ts}-owned`,
        publicKey: Buffer.from([1]),
        deviceType: 'singleDevice',
        label: 'A',
        transports: [],
      },
    });
    const { challengeId } = await passkeys.authenticationOptions();
    const response = {
      id: `cred-${ts}-owned`,
      rawId: `cred-${ts}-owned`,
      type: 'public-key',
      response: {
        userHandle: Buffer.from(b.sub, 'utf8').toString('base64url'),
      },
      clientExtensionResults: {},
    } as never;
    expect(
      await codeOf(passkeys.authenticationVerify(challengeId, response, {})),
    ).toBe('PASSKEY_REJECTED');
  });

  it('listing, renaming and removing are scoped to the owner; the last way in cannot be removed', async () => {
    const [a, b] = users;
    const only = await prisma.passkeyCredential.findFirstOrThrow({
      where: { userId: a.sub },
    });
    expect(await codeOf(passkeys.rename(b.sub, only.id, 'Mine now'))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(passkeys.remove(b, only.id))).toBe('NOT_FOUND');
    expect(await passkeys.list(b.sub)).toHaveLength(0);

    // A has an unverified email, no provider and this one passkey.
    expect(await codeOf(passkeys.remove(a, only.id))).toBe(
      'LAST_SIGN_IN_METHOD',
    );
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
    await expect(passkeys.remove(a, only.id)).resolves.toEqual({
      removed: true,
    });
    await expect(
      passkeys.rename(a.sub, second.id, '  Work   laptop '),
    ).resolves.toEqual({ id: second.id, label: 'Work laptop' });
    expect(await passkeys.list(a.sub)).toEqual([
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
