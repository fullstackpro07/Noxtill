import { seoAiComplete } from './seo-rules.util';

describe('seoAiComplete', () => {
  const ai = (impl: () => Promise<string>) => ({ complete: jest.fn(impl) });

  it('returns the provider text', async () => {
    await expect(
      seoAiComplete(
        ai(() => Promise.resolve('ok')),
        'b1',
        'p',
        0.2,
      ),
    ).resolves.toBe('ok');
  });

  it('explains a missing provider key instead of failing generically', async () => {
    await expect(
      seoAiComplete(
        ai(() =>
          Promise.reject(new Error('ANTHROPIC_API_KEY is not configured')),
        ),
        'b1',
        'p',
        0.2,
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'SEO_AI_NOT_CONFIGURED' },
    });
  });

  it('reports other provider failures as no draft created', async () => {
    await expect(
      seoAiComplete(
        ai(() => Promise.reject(new Error('socket hang up'))),
        'b1',
        'p',
        0.2,
      ),
    ).rejects.toMatchObject({ response: { code: 'SEO_AI_FAILED' } });
  });
});
