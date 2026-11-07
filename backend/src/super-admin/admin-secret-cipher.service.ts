import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM at-rest encryption for admin TOTP secrets — same scheme as
 * `integrations/token-cipher.service.ts`. Key: `SUPER_ADMIN_SECRET_KEY` (base64, 32 bytes) when
 * set; otherwise derived from `JWT_SECRET` (whose compromise already equals full compromise), so
 * no new required env var blocks a deploy. Set the dedicated key in production.
 */
@Injectable()
export class AdminSecretCipherService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const explicit = this.config.get<string>('SUPER_ADMIN_SECRET_KEY');
    if (explicit) return Buffer.from(explicit, 'base64');
    const jwt = this.config.get<string>('JWT_SECRET');
    if (!jwt) throw new Error('JWT_SECRET is not configured');
    return createHash('sha256').update(`${jwt}:super-admin-totp`).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
  }

  decrypt(stored: string): string {
    const [iv, tag, ct] = stored.split(':');
    const decipher = createDecipheriv(
      ALGORITHM,
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
