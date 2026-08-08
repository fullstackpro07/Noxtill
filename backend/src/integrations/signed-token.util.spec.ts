import { signPayload, verifyPayload } from './signed-token.util';

interface TestPayload {
  businessId: string;
  provider: string;
}

describe('signed-token.util (BE-082)', () => {
  const secret = 'test-secret';

  it('round-trips a signed payload', () => {
    const token = signPayload<TestPayload>({ businessId: 'biz-1', provider: 'gmb' }, secret);
    const payload = verifyPayload<TestPayload>(token, secret);
    expect(payload).toEqual({ businessId: 'biz-1', provider: 'gmb' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signPayload<TestPayload>({ businessId: 'biz-1', provider: 'gmb' }, secret);
    expect(verifyPayload<TestPayload>(token, 'wrong-secret')).toBeNull();
  });

  it('rejects a tampered payload even with a valid-looking signature', () => {
    const token = signPayload<TestPayload>({ businessId: 'biz-1', provider: 'gmb' }, secret);
    const [json, signature] = token.split('.');
    const tamperedJson = Buffer.from(JSON.stringify({ businessId: 'biz-2', provider: 'gmb' })).toString('base64url');
    expect(verifyPayload<TestPayload>(`${tamperedJson}.${signature}`, secret)).toBeNull();
    expect(json).not.toBe(tamperedJson);
  });

  it('rejects a malformed token', () => {
    expect(verifyPayload<TestPayload>('not-a-real-token', secret)).toBeNull();
  });
});
