import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { slugify } from '../../common/utils/slug.util';
import { DEFAULT_WORKING_HOURS } from '../../bookings/bookings.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  AuthService,
  maskEmail,
  nameFromIdentity,
  type LoginOutcome,
  type RequestMeta,
} from '../auth.service';
import { AuthTokensService } from '../auth-tokens.service';
import { emailVerificationSkipped } from '../email-verification.flag';
import { SignInMethodsService } from '../sign-in-methods.service';
import { SessionsService } from '../sessions.service';
import { AuthRateLimitService } from '../security/auth-rate-limit.service';
import { hashPassword, normalizeEmail } from '../security/password.service';
import {
  callbackUrl,
  frontendUrl,
  isSocialProvider,
  passkeysEnabled,
  PROVIDER_LABEL,
  providerCredentials,
  providerEnabled,
  SOCIAL_PROVIDERS,
  type ProviderProfile,
  type SocialProvider,
} from './oauth-providers';
import {
  buildAuthorizeUrl,
  exchangeCodeForIdToken,
  googleDef,
  microsoftDef,
  remoteJwks,
  verifyIdToken,
  type OidcProviderDef,
} from './oidc';
import {
  facebookAuthorizeUrl,
  facebookProfile,
  facebookVersion,
} from './facebook-login';

const TX_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 2 * 60_000;
const TICKET_TTL_MS = 15 * 60_000;

type Profile = Omit<ProviderProfile, 'email'> & { email?: string };

type CallbackResult =
  | { kind: 'user'; userId: string; provider: SocialProvider }
  | { kind: 'needs_email'; profile: Profile }
  /** Email matched an account but the provider didn't verify it: confirm the mailbox first (§3.1). */
  | { kind: 'confirm_link'; userId: string; email: string; profile: Profile };

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export type ExchangeOutcome =
  | LoginOutcome
  | {
      status: 'needs_email';
      ticket: string;
      provider: SocialProvider;
      name: string | null;
    }
  | {
      status: 'confirm_link';
      ticket: string;
      provider: SocialProvider;
      email: string;
    };

/**
 * Google, Microsoft and Facebook sign-in (auth security spec §2–§4).
 *
 * - Identity is `(provider, subject)`, never email.
 * - Auto-link only when the provider verified the email AND it matches an already-verified
 *   account (§3.1). A provider-verified identity arriving for an UNVERIFIED local account destroys
 *   that local credential (pre-emptive takeover, §3.2). Anything else links only after the mailbox
 *   is proven with an emailed code. Facebook email is never trusted (§3.3).
 * - State (32 bytes), nonce and PKCE S256 live server-side in a single-use `OAuthTransaction`; the
 *   browser gets a one-time handoff code, never tokens.
 * - Every sign-in ends in `AuthService.completeLogin` (lockout, suspension, MFA, owner enrolment).
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly tokens: AuthTokensService,
    private readonly methods: SignInMethodsService,
    private readonly sessions: SessionsService,
    private readonly rateLimit: AuthRateLimitService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  providers() {
    return {
      google: providerEnabled(this.config, 'google'),
      microsoft: providerEnabled(this.config, 'microsoft'),
      facebook: providerEnabled(this.config, 'facebook'),
      passkeys: passkeysEnabled(this.config),
    };
  }

  // ------------------------------------------------------------------ start / callback

  async start(
    provider: string,
    purpose: 'login' | 'link',
    userId?: string,
  ): Promise<string> {
    const p = this.requireEnabled(provider);
    const creds = providerCredentials(this.config, p)!;
    // ≥32 bytes of CSPRNG output (§4.1), stored hashed, single-use.
    const state = randomToken(32);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(48);
    await this.prisma.oAuthTransaction.create({
      data: {
        provider: p,
        purpose,
        stateHash: sha256(state),
        nonce,
        codeVerifier,
        userId: purpose === 'link' ? userId : null,
        expiresAt: new Date(Date.now() + TX_TTL_MS),
      },
    });
    const redirectUri = callbackUrl(this.config, p);
    if (p === 'facebook') {
      return facebookAuthorizeUrl({
        version: facebookVersion(this.config.get('FACEBOOK_API_VERSION')),
        clientId: creds.clientId,
        redirectUri,
        state,
      });
    }
    return buildAuthorizeUrl(this.oidcDef(p), {
      clientId: creds.clientId,
      redirectUri,
      state,
      nonce,
      codeVerifier,
    });
  }

  /** Handles the provider redirect server-side and returns where to send the browser. */
  async callback(
    provider: string,
    q: { code?: string; state?: string; error?: string },
    meta: RequestMeta,
  ): Promise<string> {
    const front = frontendUrl(this.config);
    const loginFail = (code: string) =>
      `${front}/auth/callback?error=${encodeURIComponent(code)}`;
    if (!isSocialProvider(provider)) return loginFail('provider_unavailable');
    try {
      await this.rateLimit.hit('oauthCallbackIp', meta.ipAddress);
    } catch {
      return loginFail('rate_limited');
    }

    const tx = q.state
      ? await this.prisma.oAuthTransaction.findUnique({
          where: { stateHash: sha256(q.state) },
        })
      : null;
    if (
      !tx ||
      tx.provider !== provider ||
      tx.usedAt ||
      tx.expiresAt < new Date()
    ) {
      await this.recordFailure(provider, 'state', meta);
      return loginFail('provider_state');
    }
    // Consume the transaction before doing anything else — a replayed callback gets nothing.
    const consumed = await this.prisma.oAuthTransaction.updateMany({
      where: { id: tx.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) return loginFail('provider_state');

    const linkFail = (code: string) =>
      `${front}/settings/tools/security?link_error=${encodeURIComponent(code)}`;
    const fail = tx.purpose === 'link' ? linkFail : loginFail;

    if (q.error || !q.code) return fail('provider_cancelled');
    if (!providerEnabled(this.config, provider))
      return fail('provider_unavailable');

    let profile: ProviderProfile;
    try {
      profile = await this.fetchProfile(provider, q.code, tx);
    } catch (err) {
      this.logger.warn(
        `${PROVIDER_LABEL[provider]} sign-in validation failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      await this.recordFailure(provider, 'validation', meta, tx.userId);
      return fail('provider_exchange');
    }

    if (tx.purpose === 'link') {
      if (!tx.userId) return linkFail('provider_state');
      try {
        // Signed-in "Add a sign-in method" is the safe path: linked even when the provider didn't
        // verify the email, recorded as unverified (§3.1).
        await this.attach(tx.userId, profile, meta);
      } catch (err) {
        return linkFail(errorCode(err) ?? 'provider_exchange');
      }
      return `${front}/settings/tools/security?linked=${provider}`;
    }

    let result: CallbackResult;
    try {
      result = await this.resolveLogin(profile, meta);
    } catch (err) {
      const code = errorCode(err);
      await this.recordFailure(provider, code ?? 'resolve', meta);
      return loginFail(
        code === 'PROVIDER_EMAIL_UNVERIFIED'
          ? 'provider_email_unverified'
          : 'provider_exchange',
      );
    }

    const handoff = randomToken();
    await this.prisma.oAuthTransaction.update({
      where: { id: tx.id },
      data: {
        result: result,
        handoffHash: sha256(handoff),
        handoffExpiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
      },
    });
    return `${front}/auth/callback?code=${encodeURIComponent(handoff)}`;
  }

  /** Code → validated profile. Separate method so specs can stub the provider network boundary. */
  async fetchProfile(
    provider: SocialProvider,
    code: string,
    tx: { nonce: string; codeVerifier: string },
  ): Promise<ProviderProfile> {
    const creds = providerCredentials(this.config, provider)!;
    const redirectUri = callbackUrl(this.config, provider);
    if (provider === 'facebook') {
      return facebookProfile({
        version: facebookVersion(this.config.get('FACEBOOK_API_VERSION')),
        code,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        redirectUri,
      });
    }
    const def = this.oidcDef(provider);
    const idToken = await exchangeCodeForIdToken(def, {
      code,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
      codeVerifier: tx.codeVerifier,
    });
    return verifyIdToken(def, idToken, {
      clientId: creds.clientId,
      nonce: tx.nonce,
      jwks: remoteJwks(def.jwksUrl),
    });
  }

  // ------------------------------------------------------------------ handoff / follow-up steps

  /** Redeems the one-time handoff code from the callback redirect. */
  async exchange(handoff: string, meta: RequestMeta): Promise<ExchangeOutcome> {
    const tx = await this.prisma.oAuthTransaction.findUnique({
      where: { handoffHash: sha256(handoff) },
    });
    if (
      !tx ||
      !tx.result ||
      tx.handoffUsedAt ||
      !tx.handoffExpiresAt ||
      tx.handoffExpiresAt < new Date()
    ) {
      throw expired();
    }
    const consumed = await this.prisma.oAuthTransaction.updateMany({
      where: { id: tx.id, handoffUsedAt: null },
      data: { handoffUsedAt: new Date() },
    });
    if (consumed.count === 0) throw expired();

    const result = tx.result as unknown as CallbackResult;
    if (result.kind === 'user') {
      return this.auth.completeLogin(result.userId, meta, {
        method: result.provider,
      });
    }
    const ticket = await this.issueTicket(tx.id, result);
    if (result.kind === 'needs_email') {
      return {
        status: 'needs_email',
        ticket,
        provider: result.profile.provider,
        name: result.profile.name ?? null,
      };
    }
    return {
      status: 'confirm_link',
      ticket,
      provider: result.profile.provider,
      email: maskEmail(result.email),
    };
  }

  /** "Add your email" for a provider that returned none. */
  async completeSignup(
    ticket: string,
    rawEmail: string,
    meta: RequestMeta,
  ): Promise<ExchangeOutcome> {
    const { tx, result } = await this.readTicket(ticket, 'needs_email');
    const email = normalizeEmail(rawEmail);
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      // An account already has this address: prove the mailbox before linking (§3.1) — never a
      // second account, never a silent merge (§2.3).
      await this.sendLinkCode(existing.id, email, meta);
      await this.useTicket(tx.id);
      const next: CallbackResult = {
        kind: 'confirm_link',
        userId: existing.id,
        email,
        profile: result.profile,
      };
      const nextTicket = await this.issueTicket(tx.id, next);
      return {
        status: 'confirm_link',
        ticket: nextTicket,
        provider: result.profile.provider,
        email: maskEmail(email),
      };
    }
    await this.useTicket(tx.id);
    const userId = await this.createAccount(
      { ...result.profile, emailVerified: false },
      email,
    );
    return this.auth.completeLogin(userId, meta, {
      method: result.profile.provider,
    });
  }

  /** The emailed code proves mailbox control; only then is the provider identity linked. */
  async confirmLink(
    ticket: string,
    code: string,
    meta: RequestMeta,
  ): Promise<ExchangeOutcome> {
    const { tx, result } = await this.readTicket(ticket, 'confirm_link');
    await this.rateLimit.hit('otpVerifyIp', meta.ipAddress);
    await this.tokens.verifyEmailOtp(result.userId, code, 'link_email');
    await this.useTicket(tx.id);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });
    if (!user.emailVerifiedAt) {
      // The mailbox owner just proved control; an unverified local password may be an attacker's.
      await this.destroyLocalCredential(user.id, result.profile.provider);
    }
    await this.attach(
      user.id,
      { ...result.profile, emailVerified: false },
      meta,
      { email: result.email },
    );
    return this.auth.completeLogin(user.id, meta, {
      method: result.profile.provider,
    });
  }

  // ------------------------------------------------------------------ identities (settings)

  async listIdentities(userId: string) {
    const [rows, user, passkeys] = await Promise.all([
      this.prisma.authIdentity.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true, hasPassword: true },
      }),
      this.prisma.passkeyCredential.count({
        where: { userId, disabledAt: null },
      }),
    ]);
    const enabled = this.providers();
    return {
      providers: SOCIAL_PROVIDERS.map((provider) => {
        const row = rows.find((r) => r.provider === provider);
        return {
          provider,
          label: PROVIDER_LABEL[provider],
          enabled: enabled[provider],
          connected: !!row && !row.disabledAt,
          disabled: !!row?.disabledAt,
          email: row?.providerEmail ?? null,
          emailVerifiedByProvider: row?.providerEmailVerified ?? false,
          connectedAt: row?.createdAt ?? null,
          lastUsedAt: row?.lastUsedAt ?? null,
        };
      }),
      passkeys,
      passkeysEnabled: enabled.passkeys,
      emailVerified: !!(user.email && user.emailVerifiedAt),
      hasPassword: user.hasPassword,
    };
  }

  async startLink(
    user: AuthenticatedUser,
    provider: string,
    password?: string,
  ) {
    const p = this.requireEnabled(provider);
    await this.methods.assertFreshAuth(user, password);
    const existing = await this.prisma.authIdentity.findFirst({
      where: { userId: user.sub, provider: p, disabledAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        'PROVIDER_ALREADY_LINKED',
        `${PROVIDER_LABEL[p]} is already connected to your account.`,
        HttpStatus.CONFLICT,
      );
    }
    return { url: await this.start(p, 'link', user.sub) };
  }

  async unlink(user: AuthenticatedUser, provider: string, password?: string) {
    if (!isSocialProvider(provider)) throw unknownProvider();
    await this.methods.assertFreshAuth(user, password);
    const row = await this.prisma.authIdentity.findFirst({
      where: { userId: user.sub, provider },
    });
    if (!row) {
      throw new AppException(
        'NOT_FOUND',
        `${PROVIDER_LABEL[provider]} isn't connected to your account.`,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.methods.assertCanRemove(user.sub, { provider });
    // Only the identity link is removed — never the Noxtill account.
    await this.prisma.authIdentity.delete({ where: { id: row.id } });
    await this.methods.afterRemoval(user.sub, {
      type: 'identity_unlinked',
      label: PROVIDER_LABEL[provider],
      metadata: { provider },
    });
    return { disconnected: true, signedOut: true };
  }

  // ------------------------------------------------------------------ Meta platform callbacks

  /**
   * Facebook "Deauthorize callback" (§4.3): the user removed Noxtill from their Facebook settings.
   * The identity is marked inactive; the account and its business data are untouched.
   */
  async facebookDeauthorize(signedRequest: string) {
    const fbUserId = this.parseSignedRequest(signedRequest);
    const res = await this.prisma.authIdentity.updateMany({
      where: {
        provider: 'facebook',
        providerSubject: fbUserId,
        disabledAt: null,
      },
      data: { disabledAt: new Date() },
    });
    await this.securityEvents?.record({
      type: 'identity_unlinked',
      metadata: {
        provider: 'facebook',
        via: 'facebook_deauthorize',
        identities: res.count,
      },
    });
    return { ok: true };
  }

  /**
   * Facebook "Data deletion request" (§4.3): deletes the Facebook Login data Noxtill holds for that
   * Facebook user (the identity link) and answers with a confirmation code + status URL. The
   * Noxtill account itself — which may have other sign-in methods — is not deleted here; account
   * deletion follows the privacy-request path in the published privacy policy.
   */
  async facebookDataDeletion(signedRequest: string) {
    const fbUserId = this.parseSignedRequest(signedRequest);
    const confirmationCode = randomBytes(8).toString('hex');
    await this.prisma.$transaction([
      this.prisma.authIdentity.deleteMany({
        where: { provider: 'facebook', providerSubject: fbUserId },
      }),
      this.prisma.facebookDeletionRequest.create({
        data: {
          confirmationCode,
          facebookUserId: fbUserId,
          status: 'completed',
          completedAt: new Date(),
        },
      }),
    ]);
    return {
      url: `${frontendUrl(this.config)}/privacy/facebook-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  async facebookDeletionStatus(code: string) {
    const row = await this.prisma.facebookDeletionRequest.findUnique({
      where: { confirmationCode: code },
      select: { status: true, createdAt: true, completedAt: true },
    });
    if (!row)
      throw new AppException(
        'NOT_FOUND',
        'Unknown confirmation code.',
        HttpStatus.NOT_FOUND,
      );
    return { confirmationCode: code, ...row };
  }

  /** Meta signed_request: base64url(HMAC-SHA256(payload, app secret)).base64url(payload JSON). */
  private parseSignedRequest(signedRequest: string): string {
    const bad = () =>
      new AppException(
        'INVALID_SIGNED_REQUEST',
        'Invalid signed request.',
        HttpStatus.BAD_REQUEST,
      );
    const creds = providerCredentials(this.config, 'facebook');
    if (!creds) throw bad();
    const [sig, payload] = (signedRequest ?? '').split('.');
    if (!sig || !payload) throw bad();
    const expected = createHmac('sha256', creds.clientSecret)
      .update(payload)
      .digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw bad();
    let data: { algorithm?: string; user_id?: string };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        algorithm?: string;
        user_id?: string;
      };
    } catch {
      throw bad();
    }
    if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || !data.user_id)
      throw bad();
    return String(data.user_id);
  }

  // ------------------------------------------------------------------ internals

  /** §3.1–§3.3: who does this provider identity sign in as? */
  private async resolveLogin(
    profile: ProviderProfile,
    meta: RequestMeta,
  ): Promise<CallbackResult> {
    const linked = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: profile.provider,
          providerSubject: profile.subject,
        },
      },
    });
    if (linked) {
      await this.prisma.authIdentity.update({
        where: { id: linked.id },
        data: {
          lastUsedAt: new Date(),
          // Signing in again after a Facebook deauthorize means the user re-authorised the app.
          disabledAt: null,
          providerEmail: profile.email ?? linked.providerEmail,
          providerEmailVerified: profile.emailVerified,
          providerDisplayName: profile.name ?? linked.providerDisplayName,
          tenantId: profile.tenantId ?? linked.tenantId,
        },
      });
      return {
        kind: 'user',
        userId: linked.userId,
        provider: profile.provider,
      };
    }
    // Google must assert a verified email (§4.1 check 7).
    if (profile.provider === 'google' && !profile.emailVerified) {
      throw new AppException(
        'PROVIDER_EMAIL_UNVERIFIED',
        'Google email not verified.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!profile.email) return { kind: 'needs_email', profile };

    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (byEmail) {
      // Facebook never auto-links; neither does any provider that didn't verify the email.
      const trusted = profile.emailVerified && profile.provider !== 'facebook';
      if (!trusted) {
        await this.sendLinkCode(byEmail.id, profile.email, meta);
        return {
          kind: 'confirm_link',
          userId: byEmail.id,
          email: profile.email,
          profile,
        };
      }
      if (!byEmail.emailVerifiedAt) {
        // Pre-emptive takeover defence (§3.2): the genuine, provider-verified owner arrives for an
        // address that only has an unverified local password — that password is destroyed.
        await this.destroyLocalCredential(byEmail.id, profile.provider);
      }
      await this.attach(byEmail.id, profile, meta);
      return { kind: 'user', userId: byEmail.id, provider: profile.provider };
    }
    const userId = await this.createAccount(profile, profile.email);
    return { kind: 'user', userId, provider: profile.provider };
  }

  /** §3.2 step 4: delete the local credential (must reset), mark the email proven, end sessions. */
  private async destroyLocalCredential(
    userId: string,
    provider: SocialProvider,
  ) {
    const unusable = await hashPassword(randomToken(32));
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: unusable,
        passwordHistory: [],
        hasPassword: false,
        mustReset: true,
        emailVerifiedAt: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(userId, 'local_credential_destroyed');
    await this.securityEvents?.record({
      type: 'local_credential_destroyed',
      userId,
      metadata: { provider },
    });
  }

  /**
   * A new user goes through the normal Noxtill signup shape — placeholder business, owner
   * membership, 14-day trial — then onboarding. No role is derived from the provider. The email is
   * confirmed by Noxtill unless the provider verified it.
   */
  private async createAccount(
    profile: Profile,
    email: string,
  ): Promise<string> {
    // Random, unknown password; the account has no password method until one is set via reset.
    const passwordHash = await hashPassword(randomToken(32));
    const verified = profile.emailVerified || emailVerificationSkipped();
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: 'My business',
            slug: slugify('My business'),
            email,
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            workingHours: DEFAULT_WORKING_HOURS,
          },
        });
        const user = await tx.user.create({
          data: {
            name: profile.name?.trim() || nameFromIdentity(email),
            email,
            passwordHash,
            passwordHistory: [],
            hasPassword: false,
            mfaRequired: true,
            emailVerifiedAt: verified ? new Date() : null,
          },
        });
        await tx.businessUser.create({
          data: { businessId: business.id, userId: user.id, role: Role.owner },
        });
        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider: profile.provider,
            providerSubject: profile.subject,
            providerEmail: email,
            providerEmailVerified: profile.emailVerified,
            providerDisplayName: profile.name,
            tenantId: profile.tenantId,
            lastUsedAt: new Date(),
          },
        });
        return user.id;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppException(
          'ACCOUNT_EXISTS',
          'An account already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
    if (!verified) await this.tokens.sendVerifyEmail(userId, email);
    return userId;
  }

  /** Links to `userId`; refuses a subject already owned by someone else (§6.2 step 5). */
  private async attach(
    userId: string,
    profile: Profile,
    meta: RequestMeta,
    opts: { email?: string } = {},
  ) {
    const owner = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: profile.provider,
          providerSubject: profile.subject,
        },
      },
    });
    if (owner && owner.userId !== userId) {
      throw new AppException(
        'IDENTITY_TAKEN',
        'That account is already connected to a different Noxtill user.',
        HttpStatus.CONFLICT,
      );
    }
    if (owner) {
      await this.prisma.authIdentity.update({
        where: { id: owner.id },
        data: { disabledAt: null },
      });
      return;
    }
    const sameProvider = await this.prisma.authIdentity.findFirst({
      where: { userId, provider: profile.provider },
      select: { id: true },
    });
    if (sameProvider) {
      throw new AppException(
        'PROVIDER_ALREADY_LINKED',
        `${PROVIDER_LABEL[profile.provider]} is already connected to your account.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.authIdentity.create({
      data: {
        userId,
        provider: profile.provider,
        providerSubject: profile.subject,
        providerEmail: opts.email ?? profile.email,
        providerEmailVerified: profile.emailVerified,
        providerDisplayName: profile.name,
        tenantId: profile.tenantId,
        lastUsedAt: new Date(),
      },
    });
    await this.securityEvents?.record({
      type: 'identity_linked',
      userId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: {
        provider: profile.provider,
        emailVerifiedByProvider: profile.emailVerified,
      },
    });
  }

  private async sendLinkCode(userId: string, email: string, meta: RequestMeta) {
    await this.rateLimit.hit('otpRequestIp', meta.ipAddress);
    await this.rateLimit.hit('otpRequestAccount', email);
    await this.tokens.sendEmailCode(userId, email, 'link_email');
  }

  private async issueTicket(txId: string, result: CallbackResult) {
    const ticket = randomToken();
    await this.prisma.oAuthTransaction.update({
      where: { id: txId },
      data: {
        result: result,
        ticketHash: sha256(ticket),
        ticketExpiresAt: new Date(Date.now() + TICKET_TTL_MS),
        ticketUsedAt: null,
      },
    });
    return ticket;
  }

  private async readTicket<K extends 'needs_email' | 'confirm_link'>(
    ticket: string,
    kind: K,
  ) {
    const tx = await this.prisma.oAuthTransaction.findUnique({
      where: { ticketHash: sha256(ticket) },
    });
    const result = tx?.result as unknown as CallbackResult | undefined;
    if (
      !tx ||
      result?.kind !== kind ||
      tx.ticketUsedAt ||
      !tx.ticketExpiresAt ||
      tx.ticketExpiresAt < new Date()
    ) {
      throw expired();
    }
    return { tx, result: result as Extract<CallbackResult, { kind: K }> };
  }

  private async useTicket(txId: string) {
    const res = await this.prisma.oAuthTransaction.updateMany({
      where: { id: txId, ticketUsedAt: null },
      data: { ticketUsedAt: new Date() },
    });
    if (res.count === 0) throw expired();
  }

  private requireEnabled(provider: string): SocialProvider {
    if (!isSocialProvider(provider)) throw unknownProvider();
    if (!providerEnabled(this.config, provider)) {
      throw new AppException(
        'PROVIDER_NOT_CONFIGURED',
        `${PROVIDER_LABEL[provider]} sign-in is not available.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return provider;
  }

  private oidcDef(provider: 'google' | 'microsoft'): OidcProviderDef {
    return provider === 'google'
      ? googleDef()
      : microsoftDef(
          this.config.get<string>('MICROSOFT_TENANT') || 'common',
          (this.config.get<string>('MICROSOFT_ALLOWED_TENANTS') ?? '').split(
            ',',
          ),
        );
  }

  private async recordFailure(
    provider: string,
    reason: string,
    meta: RequestMeta,
    userId?: string | null,
  ) {
    await this.securityEvents?.record({
      type: 'login_provider_failed',
      userId: userId ?? null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { provider, reason },
    });
  }
}

function errorCode(err: unknown): string | undefined {
  if (err instanceof AppException)
    return (err.getResponse() as { code?: string }).code;
  return undefined;
}

function expired() {
  return new AppException(
    'SIGN_IN_EXPIRED',
    'This sign-in has expired. Please try again.',
    HttpStatus.BAD_REQUEST,
  );
}

function unknownProvider() {
  return new AppException(
    'PROVIDER_NOT_CONFIGURED',
    'This sign-in method is not available.',
    HttpStatus.NOT_FOUND,
  );
}
