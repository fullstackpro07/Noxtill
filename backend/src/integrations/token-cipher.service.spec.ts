import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { TokenCipherService } from './token-cipher.service';

describe('TokenCipherService (BE-082)', () => {
  const key = randomBytes(32).toString('base64');
  const service = new TokenCipherService(
    new ConfigService({ INTEGRATIONS_TOKEN_KEY: key }),
  );

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = JSON.stringify({ accessToken: 'secret-token-value' });
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain('secret-token-value');
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'same-plaintext';
    expect(service.encrypt(plaintext)).not.toBe(service.encrypt(plaintext));
  });

  it('throws if the encryption key is not configured', () => {
    const unconfigured = new TokenCipherService(new ConfigService({}));
    expect(() => unconfigured.encrypt('x')).toThrow(
      'INTEGRATIONS_TOKEN_KEY is not configured',
    );
  });

  it('fails to decrypt with a different key (authenticated encryption catches tampering)', () => {
    const encrypted = service.encrypt('some-token');
    const otherService = new TokenCipherService(
      new ConfigService({
        INTEGRATIONS_TOKEN_KEY: randomBytes(32).toString('base64'),
      }),
    );
    expect(() => otherService.decrypt(encrypted)).toThrow();
  });
});
