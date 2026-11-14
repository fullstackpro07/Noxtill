import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'crypto';

/**
 * A minimal software WebAuthn authenticator (ES256) for integration specs: produces real,
 * correctly signed assertions so the passkey verification path is exercised end to end without a
 * browser. Never used outside tests.
 */
export class SoftAuthenticator {
  readonly credentialId = randomBytes(16).toString('base64url');
  private readonly privateKey: KeyObject;
  readonly cosePublicKey: Buffer;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const x = Buffer.from(jwk.x, 'base64url');
    const y = Buffer.from(jwk.y, 'base64url');
    // CBOR map {1:2 (EC2), 3:-7 (ES256), -1:1 (P-256), -2:x, -3:y}
    this.cosePublicKey = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]);
  }

  /** An authentication response for `challenge` reporting `counter`. */
  assertion(
    challenge: string,
    counter: number,
    opts: { userHandle?: string; origin?: string } = {},
  ) {
    const rpIdHash = createHash('sha256').update(this.rpId).digest();
    const flags = Buffer.from([0x05]); // UP | UV
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    const authenticatorData = Buffer.concat([rpIdHash, flags, count]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: opts.origin ?? this.origin,
        crossOrigin: false,
      }),
    );
    const signed = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientDataJSON).digest(),
    ]);
    const signature = sign('sha256', signed, this.privateKey); // DER, as WebAuthn ES256 expects
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key' as const,
      response: {
        authenticatorData: authenticatorData.toString('base64url'),
        clientDataJSON: clientDataJSON.toString('base64url'),
        signature: signature.toString('base64url'),
        ...(opts.userHandle ? { userHandle: opts.userHandle } : {}),
      },
      clientExtensionResults: {},
    };
  }
}
