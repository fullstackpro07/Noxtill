import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { AuthService, type RequestMeta } from '../auth.service';
import { SignInMethodsService } from '../sign-in-methods.service';
import { SessionsService } from '../sessions.service';
import { AuthMailerService } from '../auth-mailer.service';
import { MfaService } from '../mfa/mfa.service';
import { AuthRateLimitService } from '../security/auth-rate-limit.service';
import { frontendUrl, passkeysEnabled } from '../oauth/oauth-providers';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;
/** ES256 and RS256 (spec §5.1). */
const ALGORITHMS = [-7, -257];

export type CounterVerdict = 'accept' | 'regression';

/** Spec §5.3 — synced passkeys always report 0; only a counting authenticator can regress. */
export function counterVerdict(
  stored: number,
  presented: number,
): CounterVerdict {
  if (stored === 0) return 'accept';
  return presented > stored ? 'accept' : 'regression';
}

/**
 * Passkeys (WebAuthn, spec §5). Cryptographic checks (challenge, origin, rpIdHash, signature, UP/UV)
 * are done by `@simplewebauthn/server`; Noxtill applies its own counter rule, stores only the public
 * key + metadata, and never receives biometrics or private keys. A passkey is registered only by an
 * already-signed-in user and is never the only way into an account (§5.4).
 */
@Injectable()
export class PasskeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly methods: SignInMethodsService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly rateLimit: AuthRateLimitService,
    @Optional() private readonly mailer?: AuthMailerService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  /** RP ID = registrable host (prod: `noxtill.com`); origin(s) = the exact frontend origin(s). */
  rp() {
    const front = new URL(frontendUrl(this.config));
    const origins = (this.config.get<string>('WEBAUTHN_ORIGIN') || front.origin)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean);
    return {
      rpID: this.config.get<string>('WEBAUTHN_RP_ID') || front.hostname,
      rpName: this.config.get<string>('WEBAUTHN_RP_NAME') || 'Noxtill',
      origins,
    };
  }

  private async isOwner(userId: string) {
    return !!(await this.prisma.businessUser.findFirst({
      where: { userId, role: 'owner' },
      select: { id: true },
    }));
  }

  /** 64 bytes of opaque random, created once per user — never the email or the user id (§5.1). */
  private async webauthnUserId(userId: string): Promise<string> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { webauthnUserId: true },
    });
    if (u.webauthnUserId) return u.webauthnUserId;
    const handle = randomBytes(64).toString('base64url');
    await this.prisma.user.update({
      where: { id: userId },
      data: { webauthnUserId: handle },
    });
    return handle;
  }

  // ---------------------------------------------------------------- registration

  async registrationOptions(user: AuthenticatedUser, password?: string) {
    this.requireEnabled();
    await this.methods.assertFreshAuth(user, password);
    const [person, existing, owner, handle] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { name: true, email: true, phone: true },
      }),
      this.prisma.passkeyCredential.findMany({
        where: { userId: user.sub },
        select: { credentialId: true, transports: true },
      }),
      this.isOwner(user.sub),
      this.webauthnUserId(user.sub),
    ]);
    if (existing.length >= MAX_PASSKEYS) {
      throw new AppException(
        'PASSKEY_LIMIT',
        `You can register up to ${MAX_PASSKEYS} passkeys. Remove one first.`,
        HttpStatus.CONFLICT,
      );
    }
    const { rpID, rpName } = this.rp();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new Uint8Array(Buffer.from(handle, 'base64url')),
      userName: person.email ?? person.phone ?? person.name,
      userDisplayName: person.name,
      attestationType: 'none',
      supportedAlgorithmIDs: ALGORITHMS,
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: transportsOf(c.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: owner ? 'required' : 'preferred',
      },
    });
    const challenge = await this.prisma.webAuthnChallenge.create({
      data: {
        userId: user.sub,
        purpose: 'register',
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async registrationVerify(
    user: AuthenticatedUser,
    challengeId: string,
    response: RegistrationResponseJSON,
    label: string | undefined,
    meta: RequestMeta,
  ) {
    this.requireEnabled();
    const challenge = await this.consumeChallenge(
      challengeId,
      'register',
      user.sub,
    );
    const { rpID, origins } = this.rp();
    const owner = await this.isOwner(user.sub);
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        expectedType: 'webauthn.create',
        requireUserPresence: true,
        requireUserVerification: owner,
        supportedAlgorithmIDs: ALGORITHMS,
      });
    } catch (err) {
      throw passkeyRejected(err);
    }
    if (!verification.verified) throw passkeyRejected();
    const info = verification.registrationInfo;
    const taken = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: info.credential.id },
      select: { id: true },
    });
    if (taken) {
      throw new AppException(
        'PASSKEY_EXISTS',
        'This passkey is already registered.',
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.prisma.passkeyCredential.create({
      data: {
        userId: user.sub,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        label: cleanLabel(label) ?? defaultLabel(meta.userAgent),
      },
    });
    await this.mfa.sync(user.sub);
    await this.securityEvents?.record({
      type: 'passkey_added',
      userId: user.sub,
      businessId: user.businessId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { passkeyId: row.id, deviceType: row.deviceType },
    });
    return toView(row);
  }

  // ---------------------------------------------------------------- sign-in / second factor / step-up

  /**
   * Without a ticket: usernameless sign-in (the browser offers any discoverable passkey). With a
   * sign-in ticket (MFA stage) or a signed-in user (step-up): only that user's passkeys.
   */
  async authenticationOptions(
    opts: { ticket?: string; user?: AuthenticatedUser; ip?: string } = {},
  ) {
    this.requireEnabled();
    await this.rateLimit.hit('passkeyIp', opts.ip);
    const { rpID } = this.rp();
    const forUser = opts.ticket
      ? await this.auth.ticketUser(opts.ticket)
      : opts.user?.sub;
    const creds = forUser
      ? await this.prisma.passkeyCredential.findMany({
          where: { userId: forUser, disabledAt: null },
          select: { credentialId: true, transports: true },
        })
      : [];
    if (forUser && !creds.length) {
      throw new AppException(
        'NO_PASSKEY',
        'No passkey is registered for this account.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: transportsOf(c.transports),
      })),
    });
    const challenge = await this.prisma.webAuthnChallenge.create({
      data: {
        userId: forUser ?? null,
        purpose: 'login',
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async authenticationVerify(
    challengeId: string,
    response: AuthenticationResponseJSON,
    meta: RequestMeta,
    opts: { ticket?: string; user?: AuthenticatedUser } = {},
  ) {
    this.requireEnabled();
    await this.rateLimit.hit('passkeyIp', meta.ipAddress);
    const expectedUser = opts.ticket
      ? await this.auth.ticketUser(opts.ticket)
      : (opts.user?.sub ?? null);
    const challenge = await this.consumeChallenge(
      challengeId,
      'login',
      expectedUser,
    );
    const cred = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
      include: { user: { select: { webauthnUserId: true } } },
    });
    if (
      !cred ||
      cred.disabledAt ||
      (expectedUser && cred.userId !== expectedUser)
    ) {
      await this.securityEvents?.record({
        type: 'login_failed',
        userId: cred?.userId ?? null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: {
          method: 'passkey',
          reason: cred?.disabledAt
            ? 'disabled_credential'
            : 'unknown_credential',
        },
      });
      throw passkeyRejected();
    }
    await this.rateLimit.hit('passkeyAccount', cred.userId);
    // A discoverable credential reports whose it is; it must match the stored owner.
    const handle = response.response.userHandle;
    if (handle) {
      const legacy =
        Buffer.from(handle, 'base64url').toString('utf8') === cred.userId;
      if (handle !== cred.user.webauthnUserId && !legacy)
        throw passkeyRejected();
    }
    const { rpID, origins } = this.rp();
    const requireUV = await this.isOwner(cred.userId);
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        expectedType: 'webauthn.get',
        requireUserVerification: requireUV,
        // The counter rule is applied by Noxtill below, after the signature is proven, so a forged
        // assertion can never disable a real credential.
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: 0,
          transports: transportsOf(cred.transports),
        },
      });
    } catch (err) {
      await this.securityEvents?.record({
        type: 'login_failed',
        userId: cred.userId,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: { method: 'passkey', reason: 'verification_failed' },
      });
      throw passkeyRejected(err);
    }
    if (!verification.verified) throw passkeyRejected();

    const presented = verification.authenticationInfo.newCounter;
    if (counterVerdict(cred.counter, presented) === 'regression') {
      await this.handleCounterRegression(
        cred.id,
        cred.userId,
        cred.label,
        cred.counter,
        presented,
      );
      throw passkeyRejected();
    }
    await this.prisma.passkeyCredential.update({
      where: { id: cred.id },
      data: {
        counter: Math.max(presented, cred.counter),
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    if (opts.ticket)
      return this.auth.completeMfaWithPasskey(opts.ticket, cred.userId, meta);
    if (opts.user) return this.auth.stepUpWithPasskey(opts.user);
    return this.auth.completeLogin(cred.userId, meta, { method: 'passkey' });
  }

  /** §5.3: possible clone — disable the credential, end every session, alert the owner, audit. */
  async handleCounterRegression(
    id: string,
    userId: string,
    label: string,
    stored: number,
    presented: number,
  ) {
    await this.prisma.passkeyCredential.update({
      where: { id },
      data: { disabledAt: new Date() },
    });
    await this.sessions.revokeAllForUser(userId, 'passkey_counter_regression');
    await this.mfa.sync(userId);
    await this.securityEvents?.record({
      type: 'passkey_counter_regression',
      userId,
      metadata: { passkeyId: id, stored, presented },
    });
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (u?.email) {
      await this.mailer?.sendNotice(u.email, {
        subject: 'A passkey on your Noxtill account was disabled',
        heading: 'Possible copied passkey',
        body: `Your passkey “${label}” reported a sign-in counter that went backwards, which can mean it was copied. We disabled it and signed out every device. If you didn’t expect this, change your password and remove the passkey.`,
        cta: 'Review account security',
        path: '/settings/tools/security',
        footnote:
          'You’re receiving this because of a security event on your Noxtill account.',
      });
    }
  }

  // ---------------------------------------------------------------- management

  async list(userId: string) {
    const rows = await this.prisma.passkeyCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toView);
  }

  async rename(userId: string, id: string, label: string) {
    const clean = cleanLabel(label);
    if (!clean)
      throw new AppException(
        'INVALID_LABEL',
        'Enter a name.',
        HttpStatus.BAD_REQUEST,
      );
    const res = await this.prisma.passkeyCredential.updateMany({
      where: { id, userId },
      data: { label: clean },
    });
    if (res.count === 0) throw notFound();
    return { id, label: clean };
  }

  async remove(user: AuthenticatedUser, id: string, password?: string) {
    await this.methods.assertFreshAuth(user, password);
    const row = await this.prisma.passkeyCredential.findFirst({
      where: { id, userId: user.sub },
      select: { id: true, label: true },
    });
    if (!row) throw notFound();
    await this.methods.assertCanRemove(user.sub, { passkeyId: id });
    await this.prisma.passkeyCredential.delete({ where: { id } });
    await this.mfa.sync(user.sub);
    await this.methods.afterRemoval(user.sub, {
      type: 'passkey_removed',
      label: `The passkey “${row.label}”`,
      metadata: { passkeyId: id },
    });
    return { removed: true, signedOut: true };
  }

  // ---------------------------------------------------------------- internals

  private requireEnabled() {
    if (!passkeysEnabled(this.config)) {
      throw new AppException(
        'PROVIDER_NOT_CONFIGURED',
        'Passkeys are not available.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** ≥16-byte challenge, server-stored, single-use, 5 minutes, bound to its user when known. */
  private async consumeChallenge(
    id: string,
    purpose: 'register' | 'login',
    userId: string | null,
  ) {
    const row = await this.prisma.webAuthnChallenge.findUnique({
      where: { id },
    });
    const invalid = () =>
      new AppException(
        'PASSKEY_CHALLENGE_INVALID',
        'This passkey request expired. Please try again.',
        HttpStatus.BAD_REQUEST,
      );
    if (
      !row ||
      row.purpose !== purpose ||
      row.usedAt ||
      row.expiresAt < new Date() ||
      (userId !== null && row.userId !== userId) ||
      (userId === null && purpose === 'login' && row.userId !== null)
    ) {
      throw invalid();
    }
    const res = await this.prisma.webAuthnChallenge.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (res.count === 0) throw invalid();
    return row.challenge;
  }
}

function transportsOf(raw: unknown): AuthenticatorTransport[] {
  return Array.isArray(raw) ? (raw as AuthenticatorTransport[]) : [];
}

function cleanLabel(label?: string): string | undefined {
  const v = label?.replace(/\s+/g, ' ').trim().slice(0, 64);
  return v || undefined;
}

/** A recognisable default name from the browser's own user agent (no fingerprinting). */
export function defaultLabel(userAgent?: string): string {
  const ua = userAgent ?? '';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return os ? `Passkey on ${os}` : 'Passkey';
}

function toView(row: {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  disabledAt?: Date | null;
}) {
  return {
    id: row.id,
    label: row.label,
    synced: row.deviceType === 'multiDevice' || row.backedUp,
    disabled: !!row.disabledAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function notFound() {
  return new AppException(
    'NOT_FOUND',
    'Passkey not found.',
    HttpStatus.NOT_FOUND,
  );
}

function passkeyRejected(err?: unknown) {
  void err;
  return new AppException(
    'PASSKEY_REJECTED',
    "We couldn't verify that passkey. Try again or use another sign-in method.",
    HttpStatus.UNAUTHORIZED,
  );
}
