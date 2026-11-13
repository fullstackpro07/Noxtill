import { HttpStatus, Injectable } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuthMailerService } from './auth-mailer.service';

export const AUTH_TOKEN_PURPOSE = {
  VERIFY_EMAIL: 'verify_email',
  RESET_PASSWORD: 'reset_password',
} as const;
export type AuthTokenPurpose =
  (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

const TTL_MS: Record<AuthTokenPurpose, number> = {
  verify_email: 10 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

/** The "Resend in 45s" countdown on Check your email is enforced here too, not just in the UI. */
export const RESEND_COOLDOWN_SECONDS = 45;
/** Minutes an email verification code stays valid (shown in the email copy). */
export const EMAIL_OTP_TTL_MINUTES = TTL_MS.verify_email / 60_000;
/** Wrong guesses allowed per code before it is burned and a new one must be requested. */
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A 6-digit code has only 10^6 values, so a plain SHA-256 would be reversible from a DB leak — keyed
 * HMAC instead. The user id is mixed in so two users' identical codes don't collide on the unique
 * `token_hash` index.
 */
export function hashEmailOtp(userId: string, code: string): string {
  const secret = process.env.JWT_SECRET || 'noxtill-dev-otp-secret';
  return createHmac('sha256', `${secret}:email-otp`)
    .update(`${userId}:${code}`)
    .digest('hex');
}

/**
 * Single-use emailed secrets: 6-digit codes for email verification, links for password reset. The
 * raw value only ever exists in the email; the DB keeps a hash, so a leak can't be replayed.
 */
@Injectable()
export class AuthTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: AuthMailerService,
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

  /** Issues a fresh 6-digit email code, invalidating any earlier unused ones. Returns the raw code. */
  async createEmailOtp(userId: string, email: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const purpose = AUTH_TOKEN_PURPOSE.VERIFY_EMAIL;
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
          tokenHash: hashEmailOtp(userId, code),
          expiresAt: new Date(Date.now() + TTL_MS[purpose]),
        },
      }),
    ]);
    return code;
  }

  async sendVerifyEmail(userId: string, email: string): Promise<boolean> {
    const code = await this.createEmailOtp(userId, email);
    return this.mailer.sendVerifyCode(email, code, EMAIL_OTP_TTL_MINUTES);
  }

  getLatestDevVerifyCode(email: string): string | undefined {
    return this.mailer.getLatestDevVerifyCode(email);
  }

  /**
   * Checks a code against the user's one live verification code and consumes it on success. Every
   * wrong guess counts; the 5th burns the code so the 10^6 space can't be walked.
   */
  async verifyEmailOtp(userId: string, code: string) {
    const invalid = (message: string) =>
      new AppException('AUTH_CODE_INVALID', message, HttpStatus.BAD_REQUEST);
    const row = await this.prisma.authToken.findFirst({
      where: {
        userId,
        purpose: AUTH_TOKEN_PURPOSE.VERIFY_EMAIL,
        usedAt: null,
      },
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
    if (reserved.count === 0) {
      throw new AppException(
        'AUTH_CODE_LOCKED',
        'Too many incorrect attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const expected = Buffer.from(row.tokenHash, 'hex');
    const actual = Buffer.from(hashEmailOtp(userId, code), 'hex');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      const used = row.attempts + 1;
      if (used >= EMAIL_OTP_MAX_ATTEMPTS) {
        await this.prisma.authToken.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        throw new AppException(
          'AUTH_CODE_LOCKED',
          'Too many incorrect attempts. Request a new code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const left = EMAIL_OTP_MAX_ATTEMPTS - used;
      throw invalid(
        `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }
    const res = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (res.count === 0) {
      throw invalid('This code has already been used.');
    }
    return row;
  }

  async sendPasswordReset(userId: string, email: string): Promise<boolean> {
    const token = await this.create(userId, AUTH_TOKEN_PURPOSE.RESET_PASSWORD);
    return this.mailer.sendPasswordReset(
      email,
      this.mailer.frontendUrl(`/reset-password?token=${token}`),
    );
  }

  /** Seconds until another verification email may be sent (0 = now). */
  async resendWaitSeconds(userId: string): Promise<number> {
    const last = await this.prisma.authToken.findFirst({
      where: { userId, purpose: AUTH_TOKEN_PURPOSE.VERIFY_EMAIL },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return 0;
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
  }

  /** Looks up a live token without consuming it. */
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

  /** Marks the token used; throws a typed error if it is unknown, used or expired. */
  async consume(token: string, purpose: AuthTokenPurpose) {
    const row = await this.peek(token, purpose);
    if (!row) {
      throw new AppException(
        'AUTH_LINK_INVALID',
        purpose === AUTH_TOKEN_PURPOSE.RESET_PASSWORD
          ? 'This reset link is invalid or has expired. Request a new one.'
          : 'This link is invalid or has expired. Request a new one.',
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
