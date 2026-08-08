import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM at-rest encryption for `Integration.tokens` (BE-082) — no encryption utility
 * existed anywhere in this codebase before this ticket, so this is greenfield rather than a
 * reuse of an established pattern. Node's built-in `crypto` avoids adding a KMS/libsodium
 * dependency for what's fundamentally a single symmetric key.
 */
@Injectable()
export class TokenCipherService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const keyB64 = this.config.get<string>('INTEGRATIONS_TOKEN_KEY');
    if (!keyB64) {
      throw new Error('INTEGRATIONS_TOKEN_KEY is not configured');
    }
    return Buffer.from(keyB64, 'base64');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(stored: string): string {
    const [ivB64, authTagB64, cipherB64] = stored.split(':');
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
