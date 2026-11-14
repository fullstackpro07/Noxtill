import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { SecurityEventsService } from '../common/security/security-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  AUTH_TOKEN_PURPOSE,
  AuthTokensService,
  EMAIL_OTP_TTL_MINUTES,
} from './auth-tokens.service';
import { AuthMailerService } from './auth-mailer.service';
import { SessionsService } from './sessions.service';
import { normalizeEmail, PasswordService } from './security/password.service';
import { AuthRateLimitService } from './security/auth-rate-limit.service';
import type { RequestMeta } from './auth.service';

/** How many previous passwords a reset refuses to reuse (the current one included). */
const PASSWORD_HISTORY_DEPTH = 5;
/** Anti-enumeration timing floor for public account endpoints (spec §6.3). */
const PUBLIC_RESPONSE_FLOOR_MS = 700;

const SECURITY_FOOTNOTE =
  'You’re receiving this because of a security event on your Noxtill account.';

/** Pads a public response to a fixed floor so real and unknown addresses take the same time. */
export async function withTimingFloor<T>(
  floorMs: number,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const left = floorMs - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }
}

/**
 * Account flows (auth security spec §6/§7): email confirmation codes, password reset (32-byte token,
 * 15 minutes, single use, every session revoked, notified on request and completion, identical
 * response and timing for unknown addresses) and password change.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokensService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly sessions: SessionsService,
    @Optional() private readonly mailer?: AuthMailerService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  // ---------------------------------------------------------------- email confirmation

  async verificationStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    const resendInSeconds = user.emailVerifiedAt
      ? 0
      : await this.tokens.resendWaitSeconds(userId);
    const devVerifyCode =
      !user.emailVerifiedAt &&
      process.env.NODE_ENV !== 'production' &&
      user.email
        ? this.tokens.getLatestDevVerifyCode(user.email)
        : undefined;
    return {
      email: user.email,
      verified: Boolean(user.emailVerifiedAt),
      resendInSeconds,
      codeLength: 6,
      codeTtlMinutes: EMAIL_OTP_TTL_MINUTES,
      ...(devVerifyCode ? { devVerifyCode } : {}),
    };
  }

  async resendVerification(userId: string, meta: RequestMeta = {}) {
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
        `You can resend the code in ${wait}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.rateLimit.hit('otpRequestIp', meta.ipAddress);
    await this.rateLimit.hit('otpRequestAccount', user.email);
    const sent = await this.tokens.sendVerifyEmail(userId, user.email);
    return { sent, email: user.email, resendInSeconds: 45 };
  }

  /** "Change email" on Check your email — only while the current address is unconfirmed. */
  async changeUnverifiedEmail(
    user: AuthenticatedUser,
    email: string,
    meta: RequestMeta = {},
  ) {
    const normalized = normalizeEmail(email);
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { email: true, emailVerifiedAt: true },
    });
    if (current.emailVerifiedAt) {
      throw new AppException(
        'EMAIL_ALREADY_VERIFIED',
        'Your email is already confirmed — change it from your account settings.',
        HttpStatus.CONFLICT,
      );
    }
    if (normalized !== current.email) {
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
        where: { id: user.sub },
        data: { email: normalized },
      });
      await this.prisma.business.updateMany({
        where: { id: user.businessId, email: current.email },
        data: { email: normalized },
      });
      // Primary email changed = mandatory revocation event (§9.3); the current session continues.
      await this.sessions.revokeAllForUser(user.sub, 'email_changed', {
        exceptSessionId: user.sessionId,
      });
    }
    await this.rateLimit.hit('otpRequestIp', meta.ipAddress);
    await this.rateLimit.hit('otpRequestAccount', normalized);
    const sent = await this.tokens.sendVerifyEmail(user.sub, normalized);
    return { sent, email: normalized, resendInSeconds: 45 };
  }

  /** Confirms the signed-in user's email with the 6-digit code we emailed them. */
  async verifyEmail(userId: string, code: string, meta: RequestMeta = {}) {
    await this.rateLimit.hit('otpVerifyIp', meta.ipAddress);
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (current.emailVerifiedAt)
      return { verified: true, email: current.email };
    const row = await this.tokens.verifyEmailOtp(userId, code, 'verify_email');
    // A code issued for an address the user has since changed away from doesn't confirm the new one.
    if (row.email && current.email !== row.email) {
      throw new AppException(
        'AUTH_CODE_INVALID',
        'This code was for a different email address. Use the newest code we sent.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { verified: true, email: current.email };
  }

  // ---------------------------------------------------------------- password reset

  /** Identical body, status and timing whether or not the address exists (§6.3, §7.4). */
  async forgotPassword(rawEmail: string, meta: RequestMeta = {}) {
    const email = normalizeEmail(rawEmail);
    return withTimingFloor(PUBLIC_RESPONSE_FLOOR_MS, async () => {
      await this.rateLimit.hit('resetIp', meta.ipAddress);
      await this.rateLimit.hit('resetAccount', email);
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
      if (user?.email) {
        await this.tokens.sendPasswordReset(user.id, user.email);
        await this.securityEvents?.record({
          type: 'password_reset_requested',
          userId: user.id,
          identifier: user.email,
          ipAddress: meta.ipAddress ?? null,
          metadata: { via: 'self_service' },
        });
      }
      return {
        ok: true,
        message: 'If that address is registered, we have sent a link.',
      };
    });
  }

  async resetTokenStatus(token: string) {
    const row = await this.tokens.peek(
      token,
      AUTH_TOKEN_PURPOSE.RESET_PASSWORD,
    );
    return { valid: Boolean(row) };
  }

  async resetPassword(token: string, password: string) {
    const live = await this.tokens.peek(
      token,
      AUTH_TOKEN_PURPOSE.RESET_PASSWORD,
    );
    if (!live) {
      // consume() raises the typed "invalid or expired" error.
      await this.tokens.consume(token, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    }
    await this.passwords.assertAcceptable(password);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: live!.userId },
    });
    const history = await this.assertNotReused(user, password);
    await this.tokens.consume(token, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordHistory: [passwordHash, ...history].slice(
          0,
          PASSWORD_HISTORY_DEPTH,
        ),
        hasPassword: true,
        mustReset: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Opening a link sent to the inbox proves ownership of it.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    // Every session and refresh token for this user ends (§7.4, §9.3).
    await this.sessions.revokeAllForUser(user.id, 'password_reset');
    await this.securityEvents?.record({
      type: 'password_reset_completed',
      userId: user.id,
      metadata: { sessionsRevoked: true },
    });
    if (user.email) {
      await this.mailer?.sendNotice(user.email, {
        subject: 'Your Noxtill password was changed',
        heading: 'Password changed',
        body: 'The password for your Noxtill account was just reset, and every device was signed out. If this wasn’t you, reset it again right away and contact Noxtill support.',
        cta: 'Sign in',
        path: '/login',
        footnote: SECURITY_FOOTNOTE,
      });
    }
    return { reset: true };
  }

  /** Signed-in password change — also a mandatory revocation event (§9.3). */
  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string | undefined,
    newPassword: string,
  ) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    if (!u.hasPassword) {
      throw new AppException(
        'NO_PASSWORD',
        'Your account has no password yet — use “Forgot password” to set one.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !currentPassword ||
      !(await this.passwords.verify(u.passwordHash, currentPassword))
    ) {
      throw new AppException(
        'INVALID_PASSWORD',
        "Your current password isn't right.",
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.passwords.assertAcceptable(newPassword);
    const history = await this.assertNotReused(u, newPassword);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash,
        passwordHistory: [passwordHash, ...history].slice(
          0,
          PASSWORD_HISTORY_DEPTH,
        ),
        mustReset: false,
      },
    });
    await this.sessions.revokeAllForUser(u.id, 'password_changed');
    await this.securityEvents?.record({
      type: 'password_changed',
      userId: u.id,
      businessId: user.businessId,
    });
    if (u.email) {
      await this.mailer?.sendNotice(u.email, {
        subject: 'Your Noxtill password was changed',
        heading: 'Password changed',
        body: 'The password for your Noxtill account was just changed and every device was signed out. If this wasn’t you, reset your password right away.',
        cta: 'Reset password',
        path: '/forgot-password',
        footnote: SECURITY_FOOTNOTE,
      });
    }
    return { changed: true };
  }

  private async assertNotReused(
    user: {
      passwordHash: string;
      passwordHistory: unknown;
      hasPassword: boolean;
    },
    password: string,
  ): Promise<string[]> {
    const history = [
      ...(user.hasPassword ? [user.passwordHash] : []),
      ...(Array.isArray(user.passwordHistory)
        ? (user.passwordHistory as string[])
        : []),
    ].filter((h, i, arr) => typeof h === 'string' && h && arr.indexOf(h) === i);
    for (const previous of history) {
      if (await this.passwords.verify(previous, password)) {
        throw new AppException(
          'PASSWORD_REUSED',
          "Choose a password you haven't used before.",
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return history;
  }
}
