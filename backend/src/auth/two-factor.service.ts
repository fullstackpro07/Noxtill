import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import {
  OTP_TEMPLATE_KEY,
  TWO_FACTOR_CODE_TTL_MINUTES,
  TWO_FACTOR_ERROR_CODES,
  TWO_FACTOR_MAX_ATTEMPTS,
} from './two-factor.constants';

const BCRYPT_ROUNDS = 10;

/**
 * WhatsApp-OTP two-factor (UPD-BE-040) — the ticket allows either WhatsApp-OTP or a TOTP
 * authenticator; WhatsApp-OTP was chosen since it reuses the existing `SendGateService` pipeline
 * (real quota/opt-out/channel handling) rather than adding a new TOTP dependency to a codebase
 * that's WhatsApp-first by design. Codes are never stored raw, only bcrypt-hashed, same as passwords.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async generateAndSend(
    userId: string,
    businessId: string,
    phone: string,
  ): Promise<void> {
    const code = randomInt(100_000, 999_999).toString();
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + TWO_FACTOR_CODE_TTL_MINUTES * 60_000,
    );

    await this.prisma.twoFactorCode.create({
      data: { userId, codeHash, expiresAt },
    });

    await this.sendGate.send({
      businessId,
      templateKey: OTP_TEMPLATE_KEY,
      to: { phone },
      variables: {
        code,
        ttlMinutes: String(TWO_FACTOR_CODE_TTL_MINUTES),
      },
    });
  }

  /** Verifies against the user's most recent unconsumed code — throws a clear reason on failure, never silently returns false. */
  async verify(userId: string, code: string): Promise<void> {
    const pending = await this.prisma.twoFactorCode.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.CODE_INVALID,
        'No pending verification code — request a new one',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pending.expiresAt < new Date()) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.CODE_EXPIRED,
        'This code has expired — request a new one',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pending.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS,
        'Too many incorrect attempts — request a new code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const matches = await bcrypt.compare(code, pending.codeHash);
    if (!matches) {
      await this.prisma.twoFactorCode.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.CODE_INVALID,
        'Incorrect code',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.twoFactorCode.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });
  }
}
