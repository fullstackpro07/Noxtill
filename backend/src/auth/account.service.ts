import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { slugify } from '../common/utils/slug.util';
import { DEFAULT_WORKING_HOURS } from '../bookings/bookings.constants';
import { AuthService, nameFromIdentity } from './auth.service';
import { AUTH_TOKEN_PURPOSE, AuthTokensService } from './auth-tokens.service';

const BCRYPT_ROUNDS = 10;
/** How many previous passwords a reset refuses to reuse (the current one included). */
const PASSWORD_HISTORY_DEPTH = 5;
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

/** Same three rules the Reset screen lists. Returns the first failure, or null. */
export function passwordRuleError(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Include at least one number and one letter.';
  }
  return null;
}

/**
 * Auth & Onboarding account flows: email confirmation, password reset (anti-enumeration, 30-minute
 * single-use links, no password reuse, every session revoked afterwards) and Google sign-in.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly tokens: AuthTokensService,
  ) {}

  // ---------------------------------------------------------------- email confirmation

  async verificationStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    return {
      email: user.email,
      verified: Boolean(user.emailVerifiedAt),
      resendInSeconds: user.emailVerifiedAt
        ? 0
        : await this.tokens.resendWaitSeconds(userId),
    };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user.email || user.emailVerifiedAt) {
      throw new AppException(
        'EMAIL_ALREADY_VERIFIED',
        'This email is already confirmed.',
        HttpStatus.CONFLICT,
      );
    }
    const wait = await this.tokens.resendWaitSeconds(userId);
    if (wait > 0) {
      throw new AppException(
        'RESEND_TOO_SOON',
        `You can resend the email in ${wait}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sent = await this.tokens.sendVerifyEmail(userId, user.email);
    return { sent, email: user.email, resendInSeconds: 45 };
  }

  /** "Change email" on Check your email — only allowed while the current address is unconfirmed. */
  async changeUnverifiedEmail(
    userId: string,
    businessId: string,
    email: string,
  ) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) {
      throw new AppException(
        'EMAIL_ALREADY_VERIFIED',
        'Your email is already confirmed — change it from your account settings.',
        HttpStatus.CONFLICT,
      );
    }
    if (normalized !== user.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: normalized },
        select: { id: true },
      });
      if (taken) {
        throw new AppException(
          'ACCOUNT_EXISTS',
          'This email already has an account — log in instead',
          HttpStatus.CONFLICT,
        );
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: normalized },
      });
      await this.prisma.business.updateMany({
        where: { id: businessId, email: user.email },
        data: { email: normalized },
      });
    }
    const sent = await this.tokens.sendVerifyEmail(userId, normalized);
    return { sent, email: normalized, resendInSeconds: 45 };
  }

  async verifyEmail(token: string) {
    const row = await this.tokens.consume(
      token,
      AUTH_TOKEN_PURPOSE.VERIFY_EMAIL,
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { email: true },
    });
    // A link issued for an address the user has since changed away from doesn't confirm the new one.
    if (row.email && user.email !== row.email) {
      throw new AppException(
        'AUTH_LINK_INVALID',
        'This link was for a different email address. Use the newest email we sent.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { verified: true, email: user.email };
  }

  // ---------------------------------------------------------------- password reset

  /** Always the same response whether or not the account exists (anti-enumeration). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true },
    });
    if (user?.email) {
      await this.tokens.sendPasswordReset(user.id, user.email);
    }
    return { ok: true };
  }

  async resetTokenStatus(token: string) {
    const row = await this.tokens.peek(
      token,
      AUTH_TOKEN_PURPOSE.RESET_PASSWORD,
    );
    return { valid: Boolean(row) };
  }

  async resetPassword(token: string, password: string) {
    const ruleError = passwordRuleError(password);
    if (ruleError) {
      throw new AppException(
        'WEAK_PASSWORD',
        ruleError,
        HttpStatus.BAD_REQUEST,
      );
    }
    const live = await this.tokens.peek(
      token,
      AUTH_TOKEN_PURPOSE.RESET_PASSWORD,
    );
    if (!live) {
      // consume() raises the typed "invalid or expired" error.
      await this.tokens.consume(token, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: live!.userId },
      select: {
        id: true,
        passwordHash: true,
        passwordHistory: true,
        emailVerifiedAt: true,
      },
    });
    const history = [
      user.passwordHash,
      ...(Array.isArray(user.passwordHistory)
        ? (user.passwordHistory as string[])
        : []),
    ];
    for (const previous of history) {
      if (
        typeof previous === 'string' &&
        (await bcrypt.compare(password, previous))
      ) {
        throw new AppException(
          'PASSWORD_REUSED',
          "Choose a password you haven't used before.",
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    await this.tokens.consume(token, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const nextHistory = [
      passwordHash,
      ...history.filter((h) => h !== passwordHash),
    ]
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .slice(0, PASSWORD_HISTORY_DEPTH);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordHistory: nextHistory,
          failedLoginAttempts: 0,
          lockedUntil: null,
          // Clicking a link sent to the inbox proves ownership of it.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      }),
      // A reset signs every device out.
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { reset: true };
  }

  // ---------------------------------------------------------------- Google sign-in

  providers() {
    return {
      google: Boolean(
        this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') &&
        this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      ),
      // No Apple Services ID / key is configured anywhere in this codebase.
      apple: false,
    };
  }

  private googleRedirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl.replace(/\/$/, '')}/auth/google/callback`;
  }

  private stateSecret() {
    return `${this.config.get<string>('JWT_SECRET')}:oauth-state`;
  }

  async googleAuthUrl(): Promise<string> {
    if (!this.providers().google) {
      throw new AppException(
        'PROVIDER_NOT_CONFIGURED',
        'Google sign-in is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const state = await this.jwt.signAsync(
      { n: randomBytes(8).toString('hex') },
      { secret: this.stateSecret(), expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '',
      redirect_uri: this.googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
    });
    return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Returns the frontend URL to redirect the browser to — tokens travel in the URL fragment. */
  async googleCallback(
    code: string | undefined,
    state: string | undefined,
    meta: RequestMeta,
  ): Promise<string> {
    const frontend = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const fail = (reason: string) =>
      `${frontend}/login?error=${encodeURIComponent(reason)}`;
    if (!code || !state) return fail('google_cancelled');
    try {
      await this.jwt.verifyAsync(state, { secret: this.stateSecret() });
    } catch {
      return fail('google_state');
    }
    let profile: {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    try {
      const tokenRes = await axios.post<{ access_token: string }>(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          client_id: this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '',
          client_secret:
            this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.googleRedirectUri(),
        }).toString(),
        { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      );
      const info = await axios.get<typeof profile>(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      profile = info.data;
    } catch (err) {
      this.logger.error(
        'Google sign-in exchange failed',
        err instanceof Error ? err.message : undefined,
      );
      return fail('google_exchange');
    }
    if (!profile.email || profile.email_verified === false) {
      return fail('google_email');
    }
    const userId = await this.findOrCreateGoogleUser({
      sub: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name,
    });
    const tokens = await this.auth.issueSessionFor(userId, meta);
    const fragment = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return `${frontend}/auth/callback#${fragment.toString()}`;
  }

  private async findOrCreateGoogleUser(p: {
    sub: string;
    email: string;
    name?: string;
  }): Promise<string> {
    const byGoogle = await this.prisma.user.findUnique({
      where: { googleId: p.sub },
      select: { id: true },
    });
    if (byGoogle) return byGoogle.id;
    const byEmail = await this.prisma.user.findUnique({
      where: { email: p.email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (byEmail) {
      await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: p.sub,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        },
      });
      return byEmail.id;
    }
    // New account: Google already verified the address. The password is random and unknown —
    // the owner can set one later through "Forgot password".
    const passwordHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      BCRYPT_ROUNDS,
    );
    const user = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: 'My business',
          slug: slugify('My business'),
          email: p.email,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          workingHours: DEFAULT_WORKING_HOURS,
        },
      });
      const created = await tx.user.create({
        data: {
          name: p.name?.trim() || nameFromIdentity(p.email),
          email: p.email,
          googleId: p.sub,
          passwordHash,
          passwordHistory: [passwordHash],
          emailVerifiedAt: new Date(),
        },
      });
      await tx.businessUser.create({
        data: { businessId: business.id, userId: created.id, role: Role.owner },
      });
      return created;
    });
    return user.id;
  }
}
