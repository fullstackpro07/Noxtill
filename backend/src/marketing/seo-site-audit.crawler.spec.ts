import axios from 'axios';
import { Readable } from 'node:stream';
import { SeoSiteAuditCrawler } from './seo-site-audit.crawler';

const publicAddress = [{ address: '93.184.216.34', family: 4 as const }];

function response(
  status: number,
  headers: Record<string, string>,
  body: string,
) {
  return {
    status,
    headers,
    data: Readable.from([Buffer.from(body)]),
  };
}

describe('SeoSiteAuditCrawler', () => {
  let crawler: SeoSiteAuditCrawler;
  let addressLookup: jest.SpyInstance;
  let httpGet: jest.SpyInstance;

  beforeEach(() => {
    crawler = new SeoSiteAuditCrawler();
    addressLookup = jest
      .spyOn(crawler, 'resolvePublicAddresses')
      .mockImplementation(() => Promise.resolve(publicAddress));
    httpGet = jest
      .spyOn(axios, 'get')
      .mockImplementation(() =>
        Promise.reject(new Error('Unmocked HTTP request')),
      );
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks robots, sitemap-discovered pages, and stores only measured page findings', async () => {
    const sequence = [
      response(
        200,
        { 'content-type': 'text/plain' },
        'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
      ),
      response(
        200,
        { 'content-type': 'application/xml' },
        '<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>',
      ),
      response(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        '<title>Home</title><meta name="description" content="Home"><h1>Home</h1><link rel="canonical" href="https://example.com/"><img src="/hero.jpg"><a href="/about">About</a>',
      ),
      response(
        200,
        { 'content-type': 'text/html' },
        '<title>Home</title><h1>About</h1>',
      ),
    ];
    httpGet.mockImplementation(() =>
      Promise.resolve(sequence.shift() as never),
    );

    const result = await crawler.audit('https://example.com');

    expect(result).toMatchObject({
      status: 'completed',
      siteUrl: 'https://example.com/',
      pagesDiscovered: 2,
      pagesCrawled: 2,
    });
    expect(result.pages[0].title).toBe('Home');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'images_missing_alt',
          url: 'https://example.com/',
        }),
        expect.objectContaining({ type: 'duplicate_title' }),
      ]),
    );
    expect(httpGet).toHaveBeenCalledTimes(4);
    expect(httpGet).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\//),
      expect.objectContaining({ proxy: false, maxRedirects: 0 }),
    );
  });

  it('refuses private and mixed public/private DNS answers before making an HTTP request', async () => {
    addressLookup.mockImplementation(() =>
      Promise.resolve([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]),
    );

    const result = await crawler.audit('https://example.com');

    expect(result.status).toBe('failed');
    expect(result.pagesCrawled).toBe(0);
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('reports a missing sitemap only after a same-site 404 or 410 response', async () => {
    const page =
      '<title>Home</title><meta name="description" content="Home"><h1>Home</h1><link rel="canonical" href="https://example.com/">';
    const sequence = [
      response(
        200,
        { 'content-type': 'text/plain' },
        'User-agent: *\nAllow: /',
      ),
      response(404, { 'content-type': 'text/plain' }, 'Not found'),
      response(200, { 'content-type': 'text/html' }, page),
    ];
    httpGet.mockImplementation(() =>
      Promise.resolve(sequence.shift() as never),
    );

    const result = await crawler.audit('https://example.com');

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'missing_sitemap',
        severity: 'low',
        url: 'https://example.com/',
      }),
    );
  });

  it('reports a broken internal link with its source page and observed destination status', async () => {
    const sequence = [
      response(
        200,
        { 'content-type': 'text/plain' },
        'User-agent: *\nAllow: /',
      ),
      response(404, { 'content-type': 'text/plain' }, 'Not found'),
      response(
        200,
        { 'content-type': 'text/html' },
        '<title>Home</title><meta name="description" content="Home"><h1>Home</h1><a href="/missing">Missing page</a>',
      ),
      response(404, { 'content-type': 'text/html' }, 'Not found'),
    ];
    httpGet.mockImplementation(() =>
      Promise.resolve(sequence.shift() as never),
    );

    const result = await crawler.audit('https://example.com');

    const brokenLink = result.issues.find(
      (issue) => issue.type === 'broken_internal_link',
    );
    expect(brokenLink).toMatchObject({
      severity: 'high',
      url: 'https://example.com/',
    });
    expect(brokenLink?.evidence).toContain(
      'https://example.com/missing, which returned HTTP 404',
    );
  });

  it('does not claim a sitemap is missing when its check fails', async () => {
    const page =
      '<title>Home</title><meta name="description" content="Home"><h1>Home</h1><link rel="canonical" href="https://example.com/">';
    const sequence = [
      response(
        200,
        { 'content-type': 'text/plain' },
        'User-agent: *\nAllow: /',
      ),
      response(503, { 'content-type': 'text/plain' }, 'Unavailable'),
      response(200, { 'content-type': 'text/html' }, page),
    ];
    httpGet.mockImplementation(() =>
      Promise.resolve(sequence.shift() as never),
    );

    const result = await crawler.audit('https://example.com');

    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ type: 'missing_sitemap' }),
    );
    expect(result.status).toBe('completed');
  });

  it('stops a redirect before requesting a private or off-site target', async () => {
    httpGet.mockResolvedValue(
      response(302, { location: 'http://127.0.0.1/admin' }, ''),
    );

    const result = await crawler.audit('https://example.com');

    expect(result.status).toBe('failed');
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('does not crawl a homepage disallowed by robots.txt', async () => {
    httpGet.mockResolvedValue(
      response(
        200,
        { 'content-type': 'text/plain' },
        'User-agent: *\nDisallow: /',
      ),
    );

    const result = await crawler.audit('https://example.com');

    expect(result.status).toBe('partial');
    expect(result.pagesCrawled).toBe(0);
    expect(result.warnings).toContain(
      'The site robots.txt disallows crawling the configured homepage.',
    );
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('caps oversized response bodies without retaining them', async () => {
    const oversized = response(
      200,
      { 'content-type': 'text/plain' },
      'User-agent: *\nDisallow: /',
    );
    oversized.data = Readable.from([Buffer.alloc(1_000_001, 97)]);
    httpGet.mockResolvedValue(oversized);

    const result = await crawler.audit('https://example.com');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('robots.txt');
  });
});
