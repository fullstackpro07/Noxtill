import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as dns from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import {
  isPublicIpAddress,
  isSameSiteHost,
  normalizeWebsiteUrl,
  parseHtmlPage,
  parseRobotsDocument,
  parseSitemapUrls,
  robotsAllowsPath,
  type RobotsDocument,
  type SeoAuditIssue,
  type SeoAuditPage,
} from './seo-site-audit.util';

const MAX_PAGES = 8;
const MAX_DEPTH = 2;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 3_000;
const BODY_TIMEOUT_MS = 3_000;

interface SafeHttpResponse {
  url: URL;
  statusCode: number;
  contentType: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface QueueItem {
  url: URL;
  depth: number;
}

interface InternalLinkEdge {
  sourceUrl: string;
  targetUrl: string;
  targetKey: string;
}

export interface SeoSiteAuditResult {
  status: 'completed' | 'partial' | 'failed';
  siteUrl: string;
  finalUrl: string | null;
  pagesDiscovered: number;
  pagesCrawled: number;
  issuesFound: number;
  pages: SeoAuditPage[];
  issues: SeoAuditIssue[];
  warnings: string[];
  error: string | null;
}

class SafeCrawlError extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}

/**
 * A deliberately bounded, user-triggered site audit. It obeys robots.txt, only crawls the
 * configured site (plus its www alias), resolves and pins public DNS addresses, and never runs
 * page JavaScript. It stores SEO observations, not copies of page content.
 */
@Injectable()
export class SeoSiteAuditCrawler {
  async audit(input: string): Promise<SeoSiteAuditResult> {
    const siteUrl = normalizeWebsiteUrl(input);
    const startingHostname = siteUrl.hostname;
    const pages: SeoAuditPage[] = [];
    const issues: SeoAuditIssue[] = [];
    const warnings: string[] = [];
    const visited = new Set<string>();
    const queued = new Set<string>();
    const internalLinkEdges: InternalLinkEdge[] = [];
    const recordedEdges = new Set<string>();
    let finalUrl: string | null = null;
    let robots: RobotsDocument;
    let rootPageFailed = false;

    try {
      const robotsUrl = new URL('/robots.txt', siteUrl);
      const robotsResponse = await this.fetchSafe(robotsUrl, startingHostname);
      if (
        robotsResponse.statusCode === 404 ||
        robotsResponse.statusCode === 410
      ) {
        robots = { rules: [], sitemaps: [] };
      } else if (
        robotsResponse.statusCode >= 200 &&
        robotsResponse.statusCode < 300
      ) {
        robots = parseRobotsDocument(robotsResponse.body);
      } else {
        throw new SafeCrawlError('robots_unavailable');
      }
    } catch {
      return this.result({
        siteUrl,
        pages,
        issues,
        warnings,
        finalUrl,
        status: 'failed',
        error:
          'The site robots.txt could not be checked safely, so no pages were crawled.',
        pagesDiscovered: 0,
      });
    }

    const rootKey = this.pageKey(siteUrl);
    const queue: QueueItem[] = [{ url: siteUrl, depth: 0 }];
    queued.add(rootKey);

    const sitemapCandidates =
      robots.sitemaps.length > 0
        ? robots.sitemaps
        : [new URL('/sitemap.xml', siteUrl).href];
    let sitemapAvailable = false;
    let sitemapExplicitlyMissing = false;
    let sitemapCheckFailed = false;
    /** Page keys listed in a sitemap this audit could read (for sitemap coverage). */
    const sitemapKeys = new Set<string>();
    for (const sitemapUrl of sitemapCandidates.slice(0, 3)) {
      try {
        const url = new URL(sitemapUrl, siteUrl);
        if (
          url.protocol !== siteUrl.protocol ||
          !isSameSiteHost(url.hostname, startingHostname) ||
          !this.isAllowedByRobots(url, robots)
        ) {
          continue;
        }
        const response = await this.fetchSafe(url, startingHostname);
        if (response.statusCode === 404 || response.statusCode === 410) {
          sitemapExplicitlyMissing = true;
          continue;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          sitemapAvailable = true;
          for (const entry of parseSitemapUrls(response.body, url, MAX_PAGES)) {
            const pageUrl = this.crawlableUrl(entry, siteUrl, startingHostname);
            if (!pageUrl || !this.isAllowedByRobots(pageUrl, robots)) continue;
            const key = this.pageKey(pageUrl);
            sitemapKeys.add(key);
            if (!queued.has(key) && queue.length < MAX_PAGES) {
              queued.add(key);
              queue.push({ url: pageUrl, depth: 1 });
            }
          }
        } else {
          sitemapCheckFailed = true;
        }
      } catch {
        // A failed fetch is unknown, not proof that the sitemap is missing.
        sitemapCheckFailed = true;
      }
    }
    if (sitemapExplicitlyMissing && !sitemapAvailable && !sitemapCheckFailed) {
      issues.push({
        type: 'missing_sitemap',
        severity: 'low',
        url: siteUrl.href,
        evidence:
          'The same-site sitemap URL(s) checked by this audit returned HTTP 404 or 410.',
        recommendation:
          'Publish a valid XML sitemap for indexable pages and reference it from robots.txt.',
      });
    }

    while (
      queue.length > 0 &&
      pages.length +
        issues.filter((issue) => issue.type === 'page_fetch_failed').length <
        MAX_PAGES
    ) {
      const current = queue.shift();
      if (!current) break;
      const key = this.pageKey(current.url);
      if (visited.has(key)) continue;
      visited.add(key);

      if (!this.isAllowedByRobots(current.url, robots)) {
        if (key === rootKey) {
          warnings.push(
            'The site robots.txt disallows crawling the configured homepage.',
          );
        }
        continue;
      }

      try {
        const response = await this.fetchSafe(current.url, startingHostname);
        finalUrl ??= this.displayUrl(response.url);
        const contentType = (response.contentType.split(';')[0] ?? '')
          .trim()
          .toLowerCase();
        const page = this.inspectPage(current.url, response, contentType);
        // Unknown (null) when no sitemap could be read — never "not in sitemap" by default.
        page.observation.inSitemap = sitemapAvailable
          ? sitemapKeys.has(key)
          : null;
        pages.push(page.observation);
        issues.push(...page.issues);

        if (contentType === 'text/html' && response.statusCode < 400) {
          for (const link of page.internalLinks) {
            const discovered = this.crawlableUrl(
              link,
              siteUrl,
              startingHostname,
            );
            if (!discovered || !this.isAllowedByRobots(discovered, robots))
              continue;
            const discoveredKey = this.pageKey(discovered);
            const sourceUrl = page.observation.finalUrl;
            const edgeKey = `${this.pageKey(new URL(sourceUrl))}->${discoveredKey}`;
            if (!recordedEdges.has(edgeKey)) {
              recordedEdges.add(edgeKey);
              internalLinkEdges.push({
                sourceUrl,
                targetUrl: this.displayUrl(discovered),
                targetKey: discoveredKey,
              });
            }
            if (current.depth >= MAX_DEPTH) continue;
            if (queued.has(discoveredKey) || visited.has(discoveredKey))
              continue;
            if (queue.length + pages.length < MAX_PAGES) {
              queued.add(discoveredKey);
              queue.push({ url: discovered, depth: current.depth + 1 });
            }
          }
        }
      } catch {
        if (key === rootKey) rootPageFailed = true;
        issues.push({
          type: 'page_fetch_failed',
          severity: key === rootKey ? 'critical' : 'high',
          url: current.url.href,
          evidence:
            'The page could not be fetched within the safe crawl limits.',
          recommendation:
            'Check that the URL is publicly reachable and responds to a standard HTTP(S) request.',
        });
      }
    }

    this.addBrokenInternalLinkFindings(pages, internalLinkEdges, issues);
    this.addDuplicateTitleFindings(pages, issues);
    if (queue.length > 0) {
      warnings.push(
        `The audit stopped at its ${MAX_PAGES}-page limit; additional pages were not checked.`,
      );
    }
    const blockedRoot = pages.length === 0 && !rootPageFailed;
    if (
      blockedRoot &&
      !warnings.some((warning) => warning.includes('robots.txt disallows'))
    ) {
      warnings.push('No crawlable pages were found on the configured site.');
    }
    const status = rootPageFailed
      ? 'failed'
      : warnings.length > 0 ||
          issues.some((issue) => issue.type === 'page_fetch_failed')
        ? 'partial'
        : 'completed';

    return this.result({
      siteUrl,
      pages,
      issues,
      warnings,
      finalUrl,
      status,
      error: rootPageFailed
        ? 'The configured homepage could not be fetched.'
        : null,
      pagesDiscovered: queued.size,
    });
  }

  private async fetchSafe(
    url: URL,
    startingHostname: string,
    redirects = 0,
  ): Promise<SafeHttpResponse> {
    this.assertSafeTarget(url, startingHostname);
    if (redirects > MAX_REDIRECTS) throw new SafeCrawlError('redirect_limit');
    const addresses = await this.resolvePublicAddresses(url.hostname);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicIpAddress(address))
    ) {
      throw new SafeCrawlError('non_public_address');
    }
    const pinnedLookup = this.pinnedLookup(url.hostname, addresses);
    const httpAgent = new HttpAgent({ lookup: pinnedLookup, keepAlive: false });
    const httpsAgent = new HttpsAgent({
      lookup: pinnedLookup,
      keepAlive: false,
    });
    let redirectTarget: URL | null = null;

    try {
      const response = await axios.get<Readable>(url.href, {
        httpAgent,
        httpsAgent,
        proxy: false,
        maxRedirects: 0,
        timeout: REQUEST_TIMEOUT_MS,
        responseType: 'stream',
        validateStatus: () => true,
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml,text/plain;q=0.8,*/*;q=0.1',
          'Accept-Encoding': 'identity',
          'User-Agent': 'NoxtillBot/1.0',
        },
      });
      const headers = response.headers as unknown as Record<
        string,
        string | string[] | undefined
      >;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = headers.location;
        response.data.destroy();
        if (typeof location !== 'string' || !location)
          throw new SafeCrawlError('redirect_invalid');
        const target = new URL(location, url);
        this.assertSafeTarget(target, startingHostname);
        if (url.protocol === 'https:' && target.protocol !== 'https:') {
          throw new SafeCrawlError('redirect_downgrade');
        }
        redirectTarget = target;
      } else {
        const contentLength = Number(headers['content-length']);
        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_RESPONSE_BYTES
        ) {
          response.data.destroy();
          throw new SafeCrawlError('response_too_large');
        }
        const body = await this.readLimitedBody(response.data);
        const contentType =
          typeof headers['content-type'] === 'string'
            ? headers['content-type']
            : '';
        return { url, statusCode: response.status, contentType, headers, body };
      }
    } catch (error) {
      if (error instanceof SafeCrawlError) throw error;
      throw new SafeCrawlError('request_failed');
    } finally {
      httpAgent.destroy();
      httpsAgent.destroy();
    }

    if (!redirectTarget) throw new SafeCrawlError('request_failed');
    return this.fetchSafe(redirectTarget, startingHostname, redirects + 1);
  }

  private assertSafeTarget(url: URL, startingHostname: string): void {
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username !== '' ||
      url.password !== '' ||
      !isSameSiteHost(url.hostname, startingHostname) ||
      (url.port !== '' &&
        !(
          (url.protocol === 'http:' && url.port === '80') ||
          (url.protocol === 'https:' && url.port === '443')
        ))
    ) {
      throw new SafeCrawlError('target_not_allowed');
    }
  }

  async resolvePublicAddresses(hostname: string): Promise<LookupAddress[]> {
    let addresses: LookupAddress[];
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new SafeCrawlError('dns_failed');
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicIpAddress(address))
    ) {
      throw new SafeCrawlError('non_public_address');
    }
    return addresses;
  }

  private pinnedLookup(
    expectedHostname: string,
    addresses: LookupAddress[],
  ): LookupFunction {
    return (hostname, options, callback) => {
      if (
        hostname.toLowerCase().replace(/\.$/, '') !==
        expectedHostname.toLowerCase().replace(/\.$/, '')
      ) {
        callback(
          Object.assign(new Error('Unexpected lookup host'), {
            code: 'ENOTFOUND',
          }),
          '',
          0,
        );
        return;
      }
      const requestedFamily =
        typeof options === 'number' ? options : options.family;
      const eligible = requestedFamily
        ? addresses.filter((address) => address.family === requestedFamily)
        : addresses;
      if (eligible.length === 0) {
        callback(
          Object.assign(new Error('Address family unavailable'), {
            code: 'ENOTFOUND',
          }),
          '',
          0,
        );
        return;
      }
      if (typeof options === 'object' && options.all) {
        callback(null, eligible);
        return;
      }
      callback(null, eligible[0].address, eligible[0].family);
    };
  }

  private readLimitedBody(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let byteLength = 0;
      let settled = false;
      const timer = setTimeout(() => {
        stream.destroy();
        finish(new SafeCrawlError('body_timeout'));
      }, BODY_TIMEOUT_MS);
      const finish = (error?: Error, body?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(body ?? '');
      };
      stream.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteLength += buffer.length;
        if (byteLength > MAX_RESPONSE_BYTES) {
          stream.destroy();
          finish(new SafeCrawlError('response_too_large'));
          return;
        }
        chunks.push(buffer);
      });
      stream.on('end', () =>
        finish(undefined, Buffer.concat(chunks).toString('utf8')),
      );
      stream.on('error', () => finish(new SafeCrawlError('body_read_failed')));
    });
  }

  private inspectPage(
    requestedUrl: URL,
    response: SafeHttpResponse,
    contentType: string,
  ): {
    observation: SeoAuditPage;
    issues: SeoAuditIssue[];
    internalLinks: string[];
  } {
    const issues: SeoAuditIssue[] = [];
    const html =
      contentType === 'text/html' || contentType === 'application/xhtml+xml';
    const parsed = html
      ? parseHtmlPage(response.body, response.url.href)
      : null;
    const noindex = Boolean(
      parsed?.noindex ||
      /\bnoindex\b/i.test(String(response.headers['x-robots-tag'] ?? '')),
    );
    const observation: SeoAuditPage = {
      url: requestedUrl.href,
      finalUrl: this.displayUrl(response.url),
      statusCode: response.statusCode,
      contentType,
      title: parsed?.title ?? null,
      description: parsed?.description ?? null,
      h1Count: parsed?.h1Count ?? null,
      h1: parsed?.h1 ?? null,
      imagesMissingAlt: parsed?.imagesMissingAlt ?? null,
      canonicalUrl: parsed?.canonicalUrl ?? null,
      noindex,
    };

    if (response.statusCode >= 400) {
      issues.push(
        this.issue(
          'http_error',
          'high',
          requestedUrl,
          `The page returned HTTP ${response.statusCode}.`,
          'Fix the response or update internal links to a working URL.',
        ),
      );
    } else if (!html) {
      issues.push(
        this.issue(
          'non_html_page',
          'low',
          requestedUrl,
          `The response content type is ${contentType || 'not provided'}.`,
          'This page was checked for reachability only; HTML metadata checks do not apply.',
        ),
      );
    } else if (parsed) {
      if (!parsed.title) {
        issues.push(
          this.issue(
            'missing_title',
            'high',
            response.url,
            'No non-empty HTML title was found.',
            'Add a concise, page-specific title inside the document head.',
          ),
        );
      }
      if (!parsed.description) {
        issues.push(
          this.issue(
            'missing_meta_description',
            'medium',
            response.url,
            'No non-empty meta description was found.',
            'Add an accurate page-specific meta description.',
          ),
        );
      }
      if (parsed.h1Count === 0) {
        issues.push(
          this.issue(
            'missing_h1',
            'medium',
            response.url,
            'No H1 heading was found in the HTML response.',
            'Add one clear primary heading that describes the page.',
          ),
        );
      } else if (parsed.h1Count > 1) {
        issues.push(
          this.issue(
            'multiple_h1',
            'low',
            response.url,
            `Found ${parsed.h1Count} H1 headings.`,
            'Review the heading hierarchy and keep one clear page-level primary heading where appropriate.',
          ),
        );
      }
      if (!parsed.canonicalUrl) {
        issues.push(
          this.issue(
            'missing_canonical',
            'low',
            response.url,
            'No canonical link element was found.',
            'Confirm whether this page needs an explicit canonical URL.',
          ),
        );
      }
      if (parsed.imagesMissingAlt > 0) {
        issues.push(
          this.issue(
            'images_missing_alt',
            'low',
            response.url,
            `${parsed.imagesMissingAlt} image(s) have no alt attribute.`,
            'Add concise alt text to informative images; use empty alt text for decorative images.',
          ),
        );
      }
      if (noindex) {
        issues.push(
          this.issue(
            'noindex_directive',
            'high',
            response.url,
            'A robots directive asks search engines not to index this page.',
            'Confirm that noindex is intentional for this page.',
          ),
        );
      }
      if (parsed.insecureResourceCount > 0) {
        issues.push(
          this.issue(
            'mixed_content',
            'medium',
            response.url,
            `Found ${parsed.insecureResourceCount} HTTP resource or link reference(s) on an HTTPS page.`,
            'Use HTTPS URLs for page resources and internal links.',
          ),
        );
      }
    }
    if (response.url.protocol === 'http:') {
      issues.push(
        this.issue(
          'insecure_http',
          'medium',
          response.url,
          'This page is served over HTTP.',
          'Configure HTTPS and redirect HTTP traffic to the secure URL.',
        ),
      );
    }

    return { observation, issues, internalLinks: parsed?.internalLinks ?? [] };
  }

  private addDuplicateTitleFindings(
    pages: SeoAuditPage[],
    issues: SeoAuditIssue[],
  ): void {
    const groups = new Map<string, SeoAuditPage[]>();
    for (const page of pages) {
      const title = page.title?.toLocaleLowerCase().trim();
      if (!title) continue;
      const group = groups.get(title) ?? [];
      group.push(page);
      groups.set(title, group);
    }
    for (const duplicatePages of groups.values()) {
      if (duplicatePages.length < 2) continue;
      for (const page of duplicatePages) {
        issues.push({
          type: 'duplicate_title',
          severity: 'medium',
          url: page.url,
          evidence: `The same page title appears on ${duplicatePages.length} crawled pages.`,
          recommendation:
            'Give each indexable page a title that accurately distinguishes its content.',
        });
      }
    }
  }

  private addBrokenInternalLinkFindings(
    pages: SeoAuditPage[],
    edges: InternalLinkEdge[],
    issues: SeoAuditIssue[],
  ): void {
    const crawledStatusByKey = new Map<string, number>();
    for (const page of pages) {
      crawledStatusByKey.set(this.pageKey(new URL(page.url)), page.statusCode);
    }

    for (const edge of edges) {
      const statusCode = crawledStatusByKey.get(edge.targetKey);
      if (statusCode === undefined || statusCode < 400) continue;
      issues.push({
        type: 'broken_internal_link',
        severity: statusCode === 404 || statusCode === 410 ? 'high' : 'medium',
        url: edge.sourceUrl,
        evidence: `This page links to ${edge.targetUrl}, which returned HTTP ${statusCode} during this audit.`,
        recommendation:
          'Fix the destination page or update/remove the link. Destinations that were not crawled are not classified.',
      });
    }
  }

  private issue(
    type: string,
    severity: SeoAuditIssue['severity'],
    url: URL,
    evidence: string,
    recommendation: string,
  ): SeoAuditIssue {
    return {
      type,
      severity,
      url: this.displayUrl(url),
      evidence,
      recommendation,
    };
  }

  private displayUrl(url: URL): string {
    const safeUrl = new URL(url.href);
    safeUrl.search = '';
    safeUrl.hash = '';
    return safeUrl.href;
  }

  private isAllowedByRobots(url: URL, robots: RobotsDocument): boolean {
    return robotsAllowsPath(robots.rules, `${url.pathname}${url.search}`);
  }

  private crawlableUrl(
    input: string,
    siteUrl: URL,
    startingHostname: string,
  ): URL | null {
    try {
      const url = new URL(input, siteUrl);
      url.hash = '';
      url.search = '';
      if (
        url.protocol !== siteUrl.protocol ||
        !isSameSiteHost(url.hostname, startingHostname) ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname.length > 1024 ||
        /\.(?:css|js|json|xml|pdf|jpe?g|png|gif|webp|svg|ico|woff2?|ttf|mp[34]|zip)$/i.test(
          url.pathname,
        )
      ) {
        return null;
      }
      this.assertSafeTarget(url, startingHostname);
      return url;
    } catch {
      return null;
    }
  }

  private pageKey(url: URL): string {
    const normalized = new URL(url.href);
    normalized.hash = '';
    normalized.search = '';
    if (normalized.pathname.length > 1)
      normalized.pathname = normalized.pathname.replace(/\/$/, '');
    return normalized.href;
  }

  private result(input: {
    siteUrl: URL;
    pages: SeoAuditPage[];
    issues: SeoAuditIssue[];
    warnings: string[];
    finalUrl: string | null;
    status: SeoSiteAuditResult['status'];
    error: string | null;
    pagesDiscovered: number;
  }): SeoSiteAuditResult {
    return {
      status: input.status,
      siteUrl: input.siteUrl.href,
      finalUrl: input.finalUrl,
      pagesDiscovered: Math.min(MAX_PAGES, input.pagesDiscovered),
      pagesCrawled: input.pages.length,
      issuesFound: input.issues.length,
      pages: input.pages,
      issues: input.issues,
      warnings: input.warnings,
      error: input.error,
    };
  }
}
