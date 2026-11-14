import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SecurityEventsService } from '../common/security/security-events.service';
import { AuthMailerService } from './auth-mailer.service';

export const AUTH_TOKEN_PURPOSE = {
  VERIFY_EMAIL: 'verify_email',
  /** Password sign-in from a device this account hasn't used before. */
  LOGIN_DEVICE: 'login_device',
  /** Confirms mailbox control before linking a provider whose email isn't provider-verified. */
  LINK_EMAIL: 'link_email',
  RESET_PASSWORD: 'reset_password',
} as const;
export type AuthTokenPurpose =
  (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];
export type EmailCodePurpose = Exclude<AuthTokenPurpose, 'reset_password'>;

const TTL_MS: Record<AuthTokenPurpose, number> = {
  verify_email: 10 * 60_000,
  login_device: 10 * 60_000,
  link_email: 10 * 60_000,
  // Auth security spec §7.4.
  reset_password: 15 * 60_000,
};

/** The "Resend in 45s" countdown on Check your email is enforced here too, not just in the UI. */
export const RESEND_COOLDOWN_SECONDS = 45;
/** Minutes an email code stays valid (shown in the email copy). */
export const EMAIL_OTP_TTL_MINUTES = TTL_MS.verify_email / 60_000;
export const RESET_TTL_MINUTES = TTL_MS.reset_password / 60_000;
/** Wrong guesses allowed per code; the 5th burns it and locks the address (§6.1). */
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_LOCK_MINUTES = 15;

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Server-side pepper held outside the database (env), spec §6.1. */
function otpPepper(): string {
  return (
    process.env.AUTH_OTP_PEPPER ||
    `${process.env.JWT_SECRET || 'noxtill-dev-otp-secret'}:email-otp`
  );
}

/**
 * HMAC-SHA256(code) keyed with the pepper and bound to the user, the email address and the purpose
 * — a login code can never be redeemed as a link or verification code (§6.1 "Binding").
 */
export function hashEmailOtp(
  userId: string,
  code: string,
  purpose: EmailCodePurpose = 'verify_email',
  email = '',
): string {
  return createHmac('sha256', otpPepper())
    .update(`${purpose}:${email.toLowerCase()}:${userId}:${code}`)
    .digest('hex');
}

/**
 * Single-use emailed secrets: 6-digit codes (verification, new-device sign-in, provider linking) and
 * password-reset links. The raw value only ever exists in the email; the DB keeps a peppered HMAC
 * (codes) or SHA-256 of a 32-byte token (links).
 */
@Injectable()
export class AuthTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: AuthMailerService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  /** Issues a fresh link, invalidating any earlier unused ones for the same purpose. */
  async create(userId: string, purpose: AuthTokenPurpose, email?: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose,
          email,
          tokenHash: hashAuthToken(token),
          expiresAt: new Date(Date.now() + TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  /**
   * Issues a fresh 6-digit code (crypto.randomInt), invalidating all outstanding codes for that
   * address + purpose ("siblings"). Returns the raw code.
   */
  async createEmailOtp(
    userId: string,
    email: string,
    purpose: EmailCodePurpose = 'verify_email',
  ): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose,
          email,
          tokenHash: hashEmailOtp(userId, code, purpose, email),
          expiresAt: new Date(Date.now() + TTL_MS[purpose]),
        },
      }),
    ]);
    await this.securityEvents?.record({
      type: 'otp_requested',
      userId,
      metadata: { purpose },
    });
    return code;
  }

  async sendVerifyEmail(userId: string, email: string): Promise<boolean> {
    const code = await this.createEmailOtp(userId, email, 'verify_email');
    return this.mailer.sendVerifyCode(email, code, EMAIL_OTP_TTL_MINUTES);
  }

  async sendEmailCode(
    userId: string,
    email: string,
    purpose: Exclude<EmailCodePurpose, 'verify_email'>,
  ): Promise<boolean> {
    const code = await this.createEmailOtp(userId, email, purpose);
    return this.mailer.sendSignInCode(
      email,
      code,
      EMAIL_OTP_TTL_MINUTES,
      purpose,
    );
  }

  getLatestDevVerifyCode(email: string): string | undefined {
    return this.mailer.getLatestDevVerifyCode(email);
  }

  /**
   * Checks a code against the user's live code for this purpose + address and consumes it on
   * success (atomically, single-use). Every wrong guess counts; the 5th burns the code and locks the
   * address for 15 minutes, notifies the owner and writes an audit event (§6.1, acceptance test 11).
   */
  async verifyEmailOtp(
    userId: string,
    code: string,
    purpose: EmailCodePurpose = 'verify_email',
  ) {
    const invalid = (message: string) =>
      new AppException('AUTH_CODE_INVALID', message, HttpStatus.BAD_REQUEST);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { otpLockedUntil: true, email: true },
    });
    if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
      throw this.lockedError(user.otpLockedUntil);
    }
    const row = await this.prisma.authToken.findFirst({
      where: { userId, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date()) {
      throw invalid('This code has expired. Request a new one.');
    }
    // Reserve an attempt atomically, so parallel guesses can't exceed the cap.
    const reserved = await this.prisma.authToken.updateMany({
      where: {
        id: row.id,
        usedAt: null,
        attempts: { lt: EMAIL_OTP_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0)
      throw invalid('This code has expired. Request a new one.');

    const expected = Buffer.from(row.tokenHash, 'hex');
    const actual = Buffer.from(
      hashEmailOtp(userId, code, purpose, row.email ?? ''),
      'hex',
    );
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      await this.securityEvents?.record({
        type: 'otp_failed',
        userId,
        metadata: { purpose },
      });
      const used = row.attempts + 1;
      if (used >= EMAIL_OTP_MAX_ATTEMPTS) {
        const until = new Date(Date.now() + EMAIL_OTP_LOCK_MINUTES * 60_000);
        await this.prisma.$transaction([
          this.prisma.authToken.updateMany({
            where: { userId, usedAt: null, purpose: { not: 'reset_password' } },
            data: { usedAt: new Date() },
          }),
          this.prisma.user.update({
            where: { id: userId },
            data: { otpLockedUntil: until },
          }),
        ]);
        await this.securityEvents?.record({
          type: 'otp_locked',
          userId,
          metadata: { purpose },
        });
        const to = row.email ?? user.email;
        if (to) {
          await this.mailer.sendNotice(to, {
            subject: 'Too many incorrect codes on your Noxtill account',
            heading: 'Code entry locked for 15 minutes',
            body: 'Someone entered the wrong sign-in code for your Noxtill account five times. For your security no code will be accepted for the next 15 minutes. If this was you, wait and request a new code. If it wasn’t, change your password.',
            cta: 'Review account security',
            path: '/settings/tools/security',
            footnote:
              'You’re receiving this because of a security event on your Noxtill account.',
          });
        }
        throw this.lockedError(until);
      }
      const left = EMAIL_OTP_MAX_ATTEMPTS - used;
      throw invalid(
        `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }
    // Consumed in the same conditional update that accepts it.
    const res = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (res.count === 0) throw invalid('This code has already been used.');
    return row;
  }

  private lockedError(until: Date) {
    const err = new AppException(
      'AUTH_CODE_LOCKED',
      'Too many incorrect codes. Try again in 15 minutes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    (err as AppException & { retryAfterSeconds?: number }).retryAfterSeconds =
      Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
    return err;
  }

  async sendPasswordReset(userId: string, email: string): Promise<boolean> {
    const token = await this.create(userId, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    return this.mailer.sendPasswordReset(
      email,
      this.mailer.frontendUrl(`/reset-password?token=${token}`),
      RESET_TTL_MINUTES,
    );
  }

  /** Seconds until another code of this purpose may be sent (0 = now). */
  async resendWaitSeconds(
    userId: string,
    purpose: EmailCodePurpose = 'verify_email',
  ): Promise<number> {
    const last = await this.prisma.authToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return 0;
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
  }

  /** Looks up a live link token without consuming it. */
  async peek(token: string, purpose: AuthTokenPurpose) {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(token) },
    });
    if (
      !row ||
      row.purpose !== purpose ||
      row.usedAt ||
      row.expiresAt < new Date()
    ) {
      return null;
    }
    return row;
  }

  /** Marks the link token used; throws a typed error if it is unknown, used or expired. */
  async consume(token: string, purpose: AuthTokenPurpose) {
    const row = await this.peek(token, purpose);
    if (!row) {
      throw new AppException(
        'AUTH_LINK_INVALID',
        'This link is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Conditional update so two concurrent clicks can't both consume it.
    const res = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (res.count === 0) {
      throw new AppException(
        'AUTH_LINK_INVALID',
        'This link has already been used.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return row;
  }
}
