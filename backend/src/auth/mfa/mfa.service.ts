import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import {
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from '../../super-admin/totp.util';

const RECOVERY_CODE_COUNT = 10;

/**
 * Second factors independent of email (auth security spec §7.3): an authenticator app (TOTP) or a
 * passkey. WhatsApp-code 2FA is retired — a phone number is not an authentication factor (§6.2).
 * `User.twoFactorEnabled` is kept in sync as "has a second factor" so existing readers (settings
 * hub coverage rows, Super Admin) stay accurate.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  // -------------------------------------------------------------- status

  /** Owners always need a second factor; so does anyone flagged mfa_required (former WhatsApp 2FA). */
  async isRequired(userId: string): Promise<boolean> {
    const [user, owner] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaRequired: true },
      }),
      this.prisma.businessUser.findFirst({
        where: { userId, role: 'owner' },
        select: { id: true },
      }),
    ]);
    return user.mfaRequired || !!owner;
  }

  async status(userId: string) {
    const [user, passkeys, required] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { totpEnabledAt: true, recoveryCodes: true },
      }),
      this.prisma.passkeyCredential.count({
        where: { userId, disabledAt: null },
      }),
      this.isRequired(userId),
    ]);
    return {
      required,
      totp: !!user.totpEnabledAt,
      totpEnabledAt: user.totpEnabledAt,
      passkeys,
      recoveryCodesLeft: Array.isArray(user.recoveryCodes)
        ? user.recoveryCodes.length
        : 0,
      enrolled: !!user.totpEnabledAt || passkeys > 0,
    };
  }

  /** Which second factors this user can answer a sign-in challenge with. */
  async methods(userId: string): Promise<('totp' | 'recovery' | 'passkey')[]> {
    const s = await this.status(userId);
    const out: ('totp' | 'recovery' | 'passkey')[] = [];
    if (s.totp) out.push('totp');
    if (s.passkeys) out.push('passkey');
    if (s.recoveryCodesLeft && (s.totp || s.passkeys)) out.push('recovery');
    return out;
  }

  /** Recomputes `twoFactorEnabled` and lifts the setup restriction once a factor exists. */
  async sync(userId: string): Promise<boolean> {
    const s = await this.status(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: s.enrolled },
    });
    if (s.enrolled) {
      await this.prisma.session.updateMany({
        where: { userId, mfaSetupRequired: true },
        data: { mfaSetupRequired: false },
      });
    }
    return s.enrolled;
  }

  // -------------------------------------------------------------- TOTP enrolment

  async startTotp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, phone: true, name: true, totpEnabledAt: true },
    });
    if (user.totpEnabledAt) {
      throw new AppException(
        'MFA_ALREADY_ENABLED',
        'An authenticator app is already set up.',
        HttpStatus.CONFLICT,
      );
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: this.encrypt(secret), totpLastStep: null },
    });
    return {
      secret,
      otpauthUrl: otpauthUrl(
        secret,
        user.email ?? user.phone ?? user.name,
        'Noxtill',
      ),
    };
  }

  /** Confirms enrolment with a first code; returns one-time recovery codes (shown once). */
  async confirmTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecretEnc: true, totpEnabledAt: true },
    });
    if (user.totpEnabledAt) {
      throw new AppException(
        'MFA_ALREADY_ENABLED',
        'An authenticator app is already set up.',
        HttpStatus.CONFLICT,
      );
    }
    if (!user.totpSecretEnc) {
      throw new AppException(
        'MFA_NOT_STARTED',
        'Start the authenticator setup again.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const step = verifyTotp(this.decrypt(user.totpSecretEnc), code);
    if (step === null) {
      throw new AppException(
        'MFA_CODE_INVALID',
        "That code isn't right. Check your authenticator app.",
        HttpStatus.BAD_REQUEST,
      );
    }
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: new Date(),
        totpLastStep: step,
        recoveryCodes: recoveryCodes.map((c) => this.hmacRecovery(userId, c)),
      },
    });
    await this.sync(userId);
    await this.securityEvents?.record({
      type: 'mfa_enabled',
      userId,
      metadata: { method: 'totp' },
    });
    return { enabled: true, recoveryCodes };
  }

  async disableTotp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    if (!user.totpEnabledAt) {
      throw new AppException(
        'MFA_NOT_ENABLED',
        'No authenticator app is set up.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const passkeys = await this.prisma.passkeyCredential.count({
      where: { userId, disabledAt: null },
    });
    if ((await this.isRequired(userId)) && passkeys === 0) {
      throw new AppException(
        'MFA_REQUIRED',
        'Your account must keep a second factor. Add a passkey before removing the authenticator app.',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: null,
        totpSecretEnc: null,
        totpLastStep: null,
        recoveryCodes: [],
      },
    });
    await this.sync(userId);
    await this.securityEvents?.record({
      type: 'mfa_disabled',
      userId,
      metadata: { method: 'totp' },
    });
    return { enabled: false };
  }

  async regenerateRecoveryCodes(userId: string) {
    const s = await this.status(userId);
    if (!s.enrolled) {
      throw new AppException(
        'MFA_NOT_ENABLED',
        'Set up a second factor first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        recoveryCodes: recoveryCodes.map((c) => this.hmacRecovery(userId, c)),
      },
    });
    return { recoveryCodes };
  }

  // -------------------------------------------------------------- verification

  /**
   * Verifies a sign-in / step-up second factor: a TOTP code (never the same time-step twice) or a
   * single-use recovery code. Throws MFA_CODE_INVALID on failure.
   */
  async verify(
    userId: string,
    input: { code?: string; recoveryCode?: string },
  ): Promise<'totp' | 'recovery'> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        totpSecretEnc: true,
        totpEnabledAt: true,
        totpLastStep: true,
        recoveryCodes: true,
      },
    });
    const fail = () =>
      new AppException(
        'MFA_CODE_INVALID',
        "That code isn't right.",
        HttpStatus.UNAUTHORIZED,
      );
    if (input.code && user.totpEnabledAt && user.totpSecretEnc) {
      const step = verifyTotp(this.decrypt(user.totpSecretEnc), input.code);
      if (
        step === null ||
        (user.totpLastStep !== null && step <= user.totpLastStep)
      )
        throw fail();
      // Conditional update: a code can't be replayed even by a concurrent request.
      const res = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
        },
        data: { totpLastStep: step },
      });
      if (res.count === 0) throw fail();
      return 'totp';
    }
    if (input.recoveryCode) {
      const stored = Array.isArray(user.recoveryCodes)
        ? (user.recoveryCodes as string[])
        : [];
      const hmac = this.hmacRecovery(userId, input.recoveryCode);
      const idx = stored.findIndex((h) => safeEqual(h, hmac));
      if (idx === -1) throw fail();
      await this.prisma.user.update({
        where: { id: userId },
        data: { recoveryCodes: stored.filter((_, i) => i !== idx) },
      });
      await this.securityEvents?.record({
        type: 'mfa_recovery_code_used',
        userId,
      });
      return 'recovery';
    }
    throw fail();
  }

  // -------------------------------------------------------------- internals

  private newRecoveryCodes(): string[] {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = Array.from(
        { length: 10 },
        () => alphabet[randomInt(alphabet.length)],
      ).join('');
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }

  private hmacRecovery(userId: string, code: string): string {
    const normalized = code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return createHmac('sha256', this.pepper())
      .update(`${userId}:${normalized}`)
      .digest('hex');
  }

  private pepper() {
    return (
      process.env.AUTH_OTP_PEPPER ||
      `${this.config.get<string>('JWT_SECRET') ?? 'dev'}:recovery`
    );
  }

  private key(): Buffer {
    const explicit = this.config.get<string>('AUTH_MFA_SECRET_KEY');
    if (explicit) return Buffer.from(explicit, 'base64');
    return createHash('sha256')
      .update(`${this.config.get<string>('JWT_SECRET') ?? 'dev'}:user-totp`)
      .digest();
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
  }

  private decrypt(stored: string): string {
    const [iv, tag, ct] = stored.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
