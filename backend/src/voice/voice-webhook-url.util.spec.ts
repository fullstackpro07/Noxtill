import { createHmac } from 'crypto';
import { AppException } from '../common/filters/app.exception';
import { verifyTwilioSignature } from '../common/webhooks/signature.util';
import { voiceWebhookRequestUrl } from './voice-webhook-url.util';

describe('voice webhook public URL behind a TLS proxy', () => {
  const originalUrl = '/api/v1/voice/webhook/ivr-input?nodeId=menu%2Fone&x=a+b';
  const request = { protocol: 'http', host: '127.0.0.1:5001', originalUrl };

  it('verifies the public HTTPS signature after the proxy forwards over HTTP', () => {
    const url = `https://voice.example.com${originalUrl}`;
    const body = { CallSid: 'CA_test_signature', Digits: '1' };
    const secret = 'test-only-signature-secret';
    const signature = createHmac('sha1', secret)
      .update(`${url}CallSid${body.CallSid}Digits${body.Digits}`)
      .digest('base64');
    const resolved = voiceWebhookRequestUrl(
      'https://voice.example.com/api/v1',
      request,
    );

    expect(resolved).toBe(url);
    expect(verifyTwilioSignature(resolved, body, signature, secret)).toBe(true);
    expect(
      verifyTwilioSignature(
        `http://${request.host}${originalUrl}`,
        body,
        signature,
        secret,
      ),
    ).toBe(false);
    expect(verifyTwilioSignature(resolved, body, 'invalid', secret)).toBe(
      false,
    );
  });

  it('uses the configured origin even if the incoming host is different', () => {
    expect(
      voiceWebhookRequestUrl('https://voice.example.com/api/v1', {
        ...request,
        host: 'untrusted.example.com',
      }),
    ).toBe(`https://voice.example.com${originalUrl}`);
  });

  it('keeps local direct-request verification when no public URL is configured', () => {
    expect(voiceWebhookRequestUrl(undefined, request)).toBe(
      `http://127.0.0.1:5001${originalUrl}`,
    );
  });

  it.each(['not a URL', 'file:///tmp/voice'])(
    'refuses invalid config %s',
    (url) => {
      expect(() => voiceWebhookRequestUrl(url, request)).toThrow(AppException);
    },
  );
});
