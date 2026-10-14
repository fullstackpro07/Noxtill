import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
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
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

/** The "Resend in 45s" countdown on Check your email is enforced here too, not just in the UI. */
export const RESEND_COOLDOWN_SECONDS = 45;

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Single-use emailed links. The raw token only ever exists in the email; the DB keeps its SHA-256,
 * so a database leak can't be replayed into a verification or a password reset.
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

  async sendVerifyEmail(userId: string, email: string): Promise<boolean> {
    const token = await this.create(
      userId,
      AUTH_TOKEN_PURPOSE.VERIFY_EMAIL,
      email,
    );
    return this.mailer.sendVerifyEmail(
      email,
      this.mailer.frontendUrl(`/verify-email?token=${token}`),
    );
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
          : 'This confirmation link is invalid or has expired. Request a new one.',
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
