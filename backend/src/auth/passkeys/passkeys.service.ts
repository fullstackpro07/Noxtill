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
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { AuthService, type RequestMeta } from '../auth.service';
import { SignInMethodsService } from '../sign-in-methods.service';
import { frontendUrl, passkeysEnabled } from '../oauth/oauth-providers';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;

/**
 * Passkeys (WebAuthn, auth spec §4.3 / §8.2). All cryptographic verification is done by
 * `@simplewebauthn/server`; Noxtill stores only the credential id, public key, counter and
 * metadata. Biometrics and private keys never leave the user's authenticator.
 *
 * A passkey sign-in ends in `AuthService.completeLogin`, so suspension, lockout and WhatsApp 2FA
 * still apply (owner decision: a passkey does not replace the 2FA code).
 */
@Injectable()
export class PasskeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly methods: SignInMethodsService,
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

  // ---------------------------------------------------------------- registration

  async registrationOptions(user: AuthenticatedUser, password?: string) {
    this.requireEnabled();
    await this.methods.assertFreshAuth(user, password);
    const [person, existing] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { name: true, email: true, phone: true },
      }),
      this.prisma.passkeyCredential.findMany({
        where: { userId: user.sub },
        select: { credentialId: true, transports: true },
      }),
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
      userID: new Uint8Array(Buffer.from(user.sub, 'utf8')),
      userName: person.email ?? person.phone ?? person.name,
      userDisplayName: person.name,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: transportsOf(c.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
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
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
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
        label: cleanLabel(label) ?? defaultLabel(meta.userAgent),
      },
    });
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

  // ---------------------------------------------------------------- sign-in

  /** Usernameless: the browser offers whichever discoverable passkey the user picks. */
  async authenticationOptions() {
    this.requireEnabled();
    const { rpID } = this.rp();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: [],
    });
    const challenge = await this.prisma.webAuthnChallenge.create({
      data: {
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
  ) {
    this.requireEnabled();
    const challenge = await this.consumeChallenge(challengeId, 'login', null);
    const cred = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!cred) {
      await this.securityEvents?.record({
        type: 'login_failed',
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: { method: 'passkey', reason: 'unknown_credential' },
      });
      throw passkeyRejected();
    }
    // A discoverable credential reports whose it is; it must match the stored owner.
    const handle = response.response.userHandle;
    if (
      handle &&
      Buffer.from(handle, 'base64url').toString('utf8') !== cred.userId
    ) {
      throw passkeyRejected();
    }
    const { rpID, origins } = this.rp();
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: cred.counter,
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
    await this.prisma.passkeyCredential.update({
      where: { id: cred.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    return this.auth.completeLogin(cred.userId, meta, { method: 'passkey' });
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
    if (!clean) {
      throw new AppException(
        'INVALID_LABEL',
        'Enter a name.',
        HttpStatus.BAD_REQUEST,
      );
    }
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
      select: { id: true },
    });
    if (!row) throw notFound();
    await this.methods.assertCanRemove(user.sub, { passkeyId: id });
    await this.prisma.passkeyCredential.delete({ where: { id } });
    await this.securityEvents?.record({
      type: 'passkey_removed',
      userId: user.sub,
      businessId: user.businessId,
      metadata: { passkeyId: id },
    });
    return { removed: true };
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

  /** Single-use + short-lived; a register challenge is bound to the user who requested it. */
  private async consumeChallenge(
    id: string,
    purpose: 'register' | 'login',
    userId: string | null,
  ): Promise<string> {
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
      (userId !== null && row.userId !== userId)
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
}) {
  return {
    id: row.id,
    label: row.label,
    synced: row.deviceType === 'multiDevice' || row.backedUp,
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
