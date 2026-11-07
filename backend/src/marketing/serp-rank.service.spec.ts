import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SerpRankService } from './serp-rank.service';

describe('SerpRankService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not call the provider or record a false no-rank result when the key is missing', async () => {
    const providerCall = jest.spyOn(axios, 'get');
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('  '),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe', 'noxtill.example'),
    ).rejects.toMatchObject({
      response: {
        code: 'SERP_PROVIDER_NOT_CONFIGURED',
        message:
          'Rank provider is not configured. Configure SERPAPI_KEY on the server to check keyword positions.',
      },
      status: 503,
    });
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('reports a provider outage instead of returning a fabricated empty result', async () => {
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue(new Error('provider unavailable'));
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe', 'noxtill.example'),
    ).rejects.toMatchObject({
      response: {
        code: 'SERP_PROVIDER_UNAVAILABLE',
      },
    });
  });

  it('returns a real matching position and the first organic result title', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        organic_results: [
          { position: 1, title: 'A local guide', link: 'https://example.com' },
          {
            position: 4,
            title: 'Noxtill Cafe official site',
            link: 'https://noxtill.example',
          },
        ],
      },
    });
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe', 'noxtill.example'),
    ).resolves.toEqual({
      rank: 4,
      topResultTitle: 'A local guide',
      businessResultUrls: ['https://noxtill.example/'],
    });
  });

  it('returns distinct canonical pages from the business domain in the same organic results', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        organic_results: [
          {
            position: 2,
            title: 'Menu',
            link: 'https://www.noxtill.example/menu/?source=google#top',
          },
          {
            position: 5,
            title: 'Order online',
            link: 'https://shop.noxtill.example/order?ref=serp',
          },
          {
            position: 6,
            title: 'Menu duplicate',
            link: 'https://noxtill.example/menu/',
          },
        ],
      },
    });
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe', 'noxtill.example'),
    ).resolves.toEqual({
      rank: 2,
      topResultTitle: 'Menu',
      businessResultUrls: [
        'https://noxtill.example/menu',
        'https://shop.noxtill.example/order',
      ],
    });
  });

  it('matches a configured website domain even when the result title omits the business name', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        organic_results: [
          {
            position: 1,
            title: 'A local guide',
            link: 'https://guide.example',
          },
          {
            position: 5,
            title: 'Order online',
            link: 'https://shop.noxtill.example/menu',
          },
        ],
      },
    });
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank(
        'coffee shop',
        'Noxtill Cafe',
        'https://www.noxtill.example/about',
      ),
    ).resolves.toEqual({
      rank: 5,
      topResultTitle: 'A local guide',
      businessResultUrls: ['https://shop.noxtill.example/menu'],
    });
  });

  it('does not fall back to a same-name result from another domain when a website is configured', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        organic_results: [
          {
            position: 2,
            title: 'Noxtill Cafe — local directory',
            link: 'https://directory.example/noxtill',
          },
        ],
      },
    });
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe', 'noxtill.example'),
    ).resolves.toEqual({
      rank: null,
      topResultTitle: 'Noxtill Cafe — local directory',
      businessResultUrls: [],
    });
  });

  it('requires the canonical website instead of approximating rank from the result title', async () => {
    const providerCall = jest.spyOn(axios, 'get');
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank('coffee shop', 'Noxtill Cafe'),
    ).rejects.toMatchObject({
      response: { code: 'SEO_SITE_NOT_CONFIGURED' },
    });
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('rejects an invalid configured website before querying the provider', async () => {
    const providerCall = jest.spyOn(axios, 'get');
    const service = new SerpRankService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(
      service.fetchRank(
        'coffee shop',
        'Noxtill Cafe',
        'mailto:team@example.com',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_SITE_URL_INVALID' },
    });
    expect(providerCall).not.toHaveBeenCalled();
  });
});
