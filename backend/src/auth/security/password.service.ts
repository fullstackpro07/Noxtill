import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { createHash } from 'crypto';
import { AppException } from '../../common/filters/app.exception';

/** Auth security spec §7.1 — OWASP-recommended Argon2id parameters. */
const ARGON2_OPTIONS = {
  // `Algorithm.Argon2id` (a const enum, unusable under isolatedModules).
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** NFKC so the same typed password verifies from any keyboard/input method (§7.2). */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/** Argon2id hash for any password Noxtill stores (also temp passwords made by staff/branch invites). */
export function hashPassword(password: string): Promise<string> {
  return argonHash(normalizePassword(password), ARGON2_OPTIONS);
}

/** Verifies against Argon2id or a legacy bcrypt hash (upgraded on the next password sign-in). */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  if (!storedHash) return false;
  const p = normalizePassword(password);
  try {
    if (storedHash.startsWith('$argon2'))
      return await argonVerify(storedHash, p);
    if (storedHash.startsWith('$2')) {
      // Legacy bcrypt hashes were made from the raw (un-normalised) password.
      return (
        (await bcrypt.compare(password, storedHash)) ||
        (await bcrypt.compare(p, storedHash))
      );
    }
  } catch {
    return false;
  }
  return false;
}

/** Email is an attribute, compared NFKC + lower-cased (§2.2). */
export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

/**
 * Passwords (spec §7): Argon2id m=19456 t=2 p=1, 12–128 characters, no composition rules, a
 * breach-corpus check via the Have I Been Pwned k-anonymity range API (only the first five hex
 * characters of the SHA-1 ever leave the server), NFKC normalisation, and transparent upgrade of
 * legacy bcrypt hashes on the next successful sign-in.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  /** A fixed Argon2id hash used to equalise timing when the account doesn't exist. */
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Returns the first policy failure (no breach check), or null. */
  policyError(password: string): string | null {
    const p = normalizePassword(password);
    if ([...p].length < PASSWORD_MIN_LENGTH) {
      return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if ([...p].length > PASSWORD_MAX_LENGTH) {
      return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
    }
    return null;
  }

  /** Throws WEAK_PASSWORD / PASSWORD_BREACHED for a new password. */
  async assertAcceptable(password: string): Promise<void> {
    const policy = this.policyError(password);
    if (policy) {
      throw new AppException('WEAK_PASSWORD', policy, HttpStatus.BAD_REQUEST);
    }
    if (await this.isBreached(password)) {
      throw new AppException(
        'PASSWORD_BREACHED',
        'This password has appeared in a data breach. Choose a different one.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(storedHash: string, password: string): Promise<boolean> {
    return verifyPassword(storedHash, password);
  }

  needsRehash(storedHash: string): boolean {
    return !storedHash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$');
  }

  /** Same work as a real verify, so "no such account" can't be told apart by timing (§6.3). */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('noxtill-timing-equaliser-password');
    await argonVerify(await this.dummyHash, normalizePassword(password)).catch(
      () => false,
    );
  }

  /**
   * k-anonymity breach check. Fails open (with a log line that never includes the password or its
   * hash) if the range API is unreachable, so an outage at the breach service can't lock everyone
   * out of sign-up. Disable entirely with AUTH_BREACH_CHECK=false (tests/offline dev).
   */
  async isBreached(password: string): Promise<boolean> {
    if (
      (this.config.get<string>('AUTH_BREACH_CHECK') ?? 'true').toLowerCase() ===
      'false'
    ) {
      return false;
    }
    const sha1 = createHash('sha1')
      .update(normalizePassword(password))
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await axios.get<string>(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'Noxtill-Auth' },
          responseType: 'text',
          timeout: 4000,
        },
      );
      return String(res.data)
        .split('\n')
        .some((line) => {
          const [hashSuffix, count] = line.trim().split(':');
          return hashSuffix === suffix && Number(count) > 0;
        });
    } catch {
      this.logger.warn(
        'Breach-corpus check unavailable; password accepted without it.',
      );
      return false;
    }
  }
}
