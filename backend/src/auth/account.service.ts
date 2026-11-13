import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { SecurityEventsService } from '../common/security/security-events.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuthService } from './auth.service';
import {
  AUTH_TOKEN_PURPOSE,
  AuthTokensService,
  EMAIL_OTP_TTL_MINUTES,
} from './auth-tokens.service';

const BCRYPT_ROUNDS = 10;
/** How many previous passwords a reset refuses to reuse (the current one included). */
const PASSWORD_HISTORY_DEPTH = 5;

/** Same three rules the Reset screen lists. Returns the first failure, or null. */
export function passwordRuleError(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Include at least one number and one letter.';
  }
  return null;
}

/**
 * Auth & Onboarding account flows: email confirmation (6-digit code, 10 minutes, 5 attempts),
 * password reset (anti-enumeration, 30-minute
 * single-use links, no password reuse, every session revoked afterwards). Social sign-in lives in
 * `oauth/social-auth.service.ts`.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly tokens: AuthTokensService,
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
        `You can resend the code in ${wait}s.`,
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

  /** Confirms the signed-in user's email with the 6-digit code we emailed them. */
  async verifyEmail(userId: string, code: string) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (current.emailVerifiedAt) {
      return { verified: true, email: current.email };
    }
    const row = await this.tokens.verifyEmailOtp(userId, code);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { email: true },
    });
    // A code issued for an address the user has since changed away from doesn't confirm the new one.
    if (row.email && user.email !== row.email) {
      throw new AppException(
        'AUTH_CODE_INVALID',
        'This code was for a different email address. Use the newest code we sent.',
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
      await this.securityEvents?.record({
        type: 'password_reset_requested',
        userId: user.id,
        identifier: user.email,
        metadata: { via: 'self_service' },
      });
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
    await this.securityEvents?.record({
      type: 'password_reset_completed',
      userId: user.id,
      metadata: { sessionsRevoked: true },
    });
    return { reset: true };
  }
}
