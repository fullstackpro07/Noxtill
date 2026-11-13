import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { slugify } from '../../common/utils/slug.util';
import { DEFAULT_WORKING_HOURS } from '../../bookings/bookings.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  AuthService,
  nameFromIdentity,
  type RequestMeta,
} from '../auth.service';
import { AuthTokensService } from '../auth-tokens.service';
import { emailVerificationSkipped } from '../email-verification.flag';
import { SignInMethodsService } from '../sign-in-methods.service';
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
const BCRYPT_ROUNDS = 10;

type CallbackResult =
  | { kind: 'user'; userId: string; provider: SocialProvider }
  | {
      kind: 'needs_email';
      provider: SocialProvider;
      subject: string;
      name?: string;
    };

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/**
 * Auth & Social Login spec §4–§8: Google, Microsoft and Facebook sign-in through one architecture.
 *
 * - Social login only proves identity. Noxtill stays the authority for accounts, memberships,
 *   roles and sessions: every successful sign-in ends in `AuthService.completeLogin`, the same gate
 *   as password login (lockout, suspension, 2FA, security events).
 * - Identities are keyed by `(provider, subject)`; email matching never links anything (§6.2).
 * - State, nonce and PKCE verifier live server-side in a single-use `OAuthTransaction`.
 * - The browser never receives Noxtill tokens in a URL: the callback redirects with a one-time,
 *   2-minute handoff code the frontend exchanges over HTTPS (§7 "Callback hardening").
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
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  /** Methods offered in this environment — a method is listed only when it can really complete. */
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
    const state = randomToken();
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
    if (!providerEnabled(this.config, provider)) {
      return fail('provider_unavailable');
    }

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
        await this.attach(tx.userId, profile, meta);
      } catch (err) {
        return linkFail(errorCode(err) ?? 'provider_exchange');
      }
      return `${front}/settings/tools/security?linked=${provider}`;
    }

    let result: CallbackResult;
    try {
      result = await this.resolveLogin(profile);
    } catch (err) {
      const code = errorCode(err);
      await this.recordFailure(provider, code ?? 'resolve', meta);
      return loginFail(
        code === 'ACCOUNT_EXISTS' ? 'account_exists' : 'provider_exchange',
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

  // ------------------------------------------------------------------ handoff / signup

  /** Redeems the one-time handoff code from the callback redirect. */
  async exchange(handoff: string, meta: RequestMeta) {
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
    const ticket = randomToken();
    await this.prisma.oAuthTransaction.update({
      where: { id: tx.id },
      data: {
        ticketHash: sha256(ticket),
        ticketExpiresAt: new Date(Date.now() + TICKET_TTL_MS),
      },
    });
    return {
      needsEmail: true as const,
      ticket,
      provider: result.provider,
      name: result.name ?? null,
    };
  }

  /** "Add your email" for a provider that returned none: creates the (unverified) account. */
  async completeSignup(ticket: string, rawEmail: string, meta: RequestMeta) {
    const tx = await this.prisma.oAuthTransaction.findUnique({
      where: { ticketHash: sha256(ticket) },
    });
    const result = tx?.result as unknown as CallbackResult | undefined;
    if (
      !tx ||
      result?.kind !== 'needs_email' ||
      tx.ticketUsedAt ||
      !tx.ticketExpiresAt ||
      tx.ticketExpiresAt < new Date()
    ) {
      throw expired();
    }
    const email = rawEmail.trim().toLowerCase();
    const label = PROVIDER_LABEL[result.provider];
    if (
      await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    ) {
      throw new AppException(
        'ACCOUNT_EXISTS',
        `This email already has a Noxtill account. Log in with it, then connect ${label} from Settings → Security.`,
        HttpStatus.CONFLICT,
      );
    }
    const consumed = await this.prisma.oAuthTransaction.updateMany({
      where: { id: tx.id, ticketUsedAt: null },
      data: { ticketUsedAt: new Date() },
    });
    if (consumed.count === 0) throw expired();

    const userId = await this.createAccount(
      {
        provider: result.provider,
        subject: result.subject,
        name: result.name,
        emailVerified: false,
      },
      email,
    );
    return this.auth.completeLogin(userId, meta, { method: result.provider });
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
        select: { email: true, emailVerifiedAt: true },
      }),
      this.prisma.passkeyCredential.count({ where: { userId } }),
    ]);
    const enabled = this.providers();
    return {
      providers: SOCIAL_PROVIDERS.map((provider) => {
        const row = rows.find((r) => r.provider === provider);
        return {
          provider,
          label: PROVIDER_LABEL[provider],
          enabled: enabled[provider],
          connected: !!row,
          email: row?.providerEmail ?? null,
          connectedAt: row?.createdAt ?? null,
          lastUsedAt: row?.lastUsedAt ?? null,
        };
      }),
      passkeys,
      passkeysEnabled: enabled.passkeys,
      emailVerified: !!(user.email && user.emailVerifiedAt),
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
      where: { userId: user.sub, provider: p },
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
    // Only the identity link is removed — never the Noxtill account (§6.5).
    await this.prisma.authIdentity.delete({ where: { id: row.id } });
    await this.securityEvents?.record({
      type: 'identity_unlinked',
      userId: user.sub,
      businessId: user.businessId,
      metadata: { provider },
    });
    return { disconnected: true };
  }

  // ------------------------------------------------------------------ internals

  /** §6.1–§6.3: linked → that user; existing email → refuse (no auto-link); else new account. */
  private async resolveLogin(
    profile: ProviderProfile,
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
          providerEmail: profile.email ?? linked.providerEmail,
          providerEmailVerified: profile.emailVerified,
          providerDisplayName: profile.name ?? linked.providerDisplayName,
        },
      });
      return {
        kind: 'user',
        userId: linked.userId,
        provider: profile.provider,
      };
    }
    if (!profile.email) {
      return {
        kind: 'needs_email',
        provider: profile.provider,
        subject: profile.subject,
        name: profile.name,
      };
    }
    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true },
    });
    if (byEmail) {
      throw new AppException(
        'ACCOUNT_EXISTS',
        'Sign in with your existing method, then connect this provider from Settings → Security.',
        HttpStatus.CONFLICT,
      );
    }
    const userId = await this.createAccount(profile, profile.email);
    return { kind: 'user', userId, provider: profile.provider };
  }

  /**
   * §6.3: a new user goes through the normal Noxtill signup shape — placeholder business, owner
   * membership via the same rows signup writes, 14-day trial — then onboarding. No role is ever
   * derived from the provider. Email is confirmed by Noxtill unless the provider verified it.
   */
  private async createAccount(
    profile: Omit<ProviderProfile, 'email'>,
    email: string,
  ): Promise<string> {
    // Random, unknown password: the owner can set one later through "Forgot password".
    const passwordHash = await bcrypt.hash(randomToken(), BCRYPT_ROUNDS);
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
            passwordHistory: [passwordHash],
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
          'Sign in with your existing method, then connect this provider from Settings → Security.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
    if (!verified) await this.tokens.sendVerifyEmail(userId, email);
    return userId;
  }

  /** §6.2 step 4–5: link to the signed-in user; refuse a subject already owned by someone else. */
  private async attach(
    userId: string,
    profile: ProviderProfile,
    meta: RequestMeta,
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
    if (owner) return;
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
        providerEmail: profile.email,
        providerEmailVerified: profile.emailVerified,
        providerDisplayName: profile.name,
      },
    });
    await this.securityEvents?.record({
      type: 'identity_linked',
      userId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { provider: profile.provider },
    });
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
      : microsoftDef(this.config.get<string>('MICROSOFT_TENANT') || 'common');
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
  if (err instanceof AppException) {
    return (err.getResponse() as { code?: string }).code;
  }
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
