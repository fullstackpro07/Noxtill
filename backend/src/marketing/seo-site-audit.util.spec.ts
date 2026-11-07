import {
  isPublicIpAddress,
  normalizeWebsiteUrl,
  parseHtmlPage,
  parseRobotsDocument,
  parseSitemapUrls,
  robotsAllowsPath,
} from './seo-site-audit.util';

describe('SEO site-audit parsing and URL safety', () => {
  it('normalizes a configured website URL and removes fragments and query parameters', () => {
    expect(
      normalizeWebsiteUrl('www.example.com/shop?token=hidden#section').href,
    ).toBe('https://www.example.com/shop');
    expect(normalizeWebsiteUrl('http://example.com:80/path').href).toBe(
      'http://example.com/path',
    );
  });

  it.each([
    'file:///etc/passwd',
    'http://127.0.0.1',
    'http://[::1]',
    'http://localhost',
    'https://user:pass@example.com',
    'https://example.com:8443',
  ])('rejects unsafe configured URL %s', (url) => {
    expect(() => normalizeWebsiteUrl(url)).toThrow();
  });

  it('allows only globally routable DNS answer ranges', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fe80::1',
      'fc00::1',
      '::ffff:8.8.8.8',
      'not-an-ip',
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });

  it('honors exact crawler robots rules, wildcard rules, specificity, allow ties and sitemaps', () => {
    const robots = parseRobotsDocument(
      [
        'User-agent: *',
        'Disallow: /blocked',
        'Allow: /blocked/public$',
        'Sitemap: https://example.com/sitemap.xml',
        'User-agent: NoxtillBot',
        'Disallow: /private',
      ].join('\n'),
    );

    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(robots.rules).toEqual([{ allow: false, pattern: '/private' }]);
    expect(robotsAllowsPath(robots.rules, '/private/page')).toBe(false);
    expect(robotsAllowsPath(robots.rules, '/public')).toBe(true);

    const wildcard = parseRobotsDocument(
      'User-agent: *\nDisallow: /blocked*\nAllow: /blocked/public$',
    );
    expect(robotsAllowsPath(wildcard.rules, '/blocked/page')).toBe(false);
    expect(robotsAllowsPath(wildcard.rules, '/blocked/public')).toBe(true);
  });

  it('keeps same-site sitemap URLs and drops external or malformed entries', () => {
    const base = new URL('https://www.example.com/sitemap.xml');
    expect(
      parseSitemapUrls(
        [
          '<url><loc>https://www.example.com/</loc></url>',
          '<url><loc>https://example.com/about</loc></url>',
          '<url><loc>https://attacker.example/</loc></url>',
        ].join(''),
        base,
        10,
      ),
    ).toEqual(['https://www.example.com/', 'https://example.com/about']);
  });

  it('extracts visible SEO checks while ignoring script text and external links', () => {
    const parsed = parseHtmlPage(
      `
      <title>Shop &amp; More</title>
      <meta content="A useful description" name="description">
      <meta name="robots" content="index, noindex">
      <h1>One</h1><h1>Two</h1>
      <img src="/hero.jpg"><img alt="" src="/decorative.svg">
      <link rel="stylesheet" href="http://cdn.example/assets.css">
      <a href="/about">About</a><a href="http://outside.example/path">Offsite</a>
      <script>const fake = '<h1>not real</h1>';</script>
    `,
      'https://example.com/',
    );

    expect(parsed).toMatchObject({
      title: 'Shop & More',
      description: 'A useful description',
      h1Count: 2,
      imagesMissingAlt: 1,
      canonicalUrl: null,
      noindex: true,
      internalLinks: ['https://example.com/about'],
      insecureResourceCount: 1,
    });
  });
});
