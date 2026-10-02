import ipaddr from 'ipaddr.js';

export type SeoIssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SeoAuditIssue {
  type: string;
  severity: SeoIssueSeverity;
  url: string;
  evidence: string;
  recommendation: string;
}

export interface SeoAuditPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  title: string | null;
  description: string | null;
  h1Count: number | null;
  /** Text of the first H1 (absent on runs recorded before this field existed). */
  h1?: string | null;
  imagesMissingAlt: number | null;
  canonicalUrl: string | null;
  noindex: boolean;
}

export interface ParsedHtmlPage {
  title: string | null;
  description: string | null;
  h1Count: number;
  h1: string | null;
  imagesMissingAlt: number;
  canonicalUrl: string | null;
  noindex: boolean;
  internalLinks: string[];
  insecureResourceCount: number;
}

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsDocument {
  rules: RobotsRule[];
  sitemaps: string[];
}

export function normalizeWebsiteUrl(input: string): URL {
  const candidate = input.trim();
  if (!candidate) throw new Error('website_missing');
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error('website_invalid');
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '');
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    !hostname ||
    url.username ||
    url.password ||
    (url.port !== '' &&
      !(
        (url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443')
      )) ||
    ipaddr.isValid(hostname) ||
    /(?:^|\.)(?:localhost|local|internal|test)$/i.test(hostname)
  ) {
    throw new Error('website_unsafe');
  }

  url.hostname = hostname;
  url.hash = '';
  url.search = '';
  return url;
}

/** Only ordinary globally routable addresses can be used for a crawl connection. */
export function isPublicIpAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress())
      return false;
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export function isSameSiteHost(
  hostname: string,
  startingHostname: string,
): boolean {
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, '');
  return normalize(hostname) === normalize(startingHostname);
}

export function parseRobotsDocument(text: string): RobotsDocument {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let sawRule = false;

  const finishGroup = () => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
    sawRule = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === 'sitemap' && value) {
      sitemaps.push(value);
      continue;
    }
    if (name === 'user-agent' && value) {
      if (sawRule) finishGroup();
      agents.push(value.toLowerCase());
      continue;
    }
    if ((name === 'allow' || name === 'disallow') && agents.length > 0) {
      sawRule = true;
      if (value.startsWith('/')) {
        rules.push({ allow: name === 'allow', pattern: value });
      }
    }
  }
  finishGroup();

  const exactGroups = groups.filter(({ agents: groupAgents }) =>
    groupAgents.some((agent) => agent === 'noxtillbot'),
  );
  const wildcardGroups = groups.filter(({ agents: groupAgents }) =>
    groupAgents.includes('*'),
  );
  const selected = exactGroups.length > 0 ? exactGroups : wildcardGroups;
  return { rules: selected.flatMap((group) => group.rules), sitemaps };
}

export function robotsAllowsPath(
  rules: RobotsRule[],
  pathname: string,
): boolean {
  const matched = rules
    .filter(({ pattern }) => robotsPatternMatches(pattern, pathname))
    .sort((left, right) => {
      const lengthDifference =
        ruleSpecificity(right.pattern) - ruleSpecificity(left.pattern);
      if (lengthDifference !== 0) return lengthDifference;
      return Number(right.allow) - Number(left.allow);
    })[0];
  return matched?.allow ?? true;
}

function robotsPatternMatches(pattern: string, pathname: string): boolean {
  const anchored = pattern.endsWith('$');
  const patternBody = anchored ? pattern.slice(0, -1) : pattern;
  const source = patternBody
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('.*');
  try {
    return new RegExp(`^${source}${anchored ? '' : '.*'}`).test(pathname);
  } catch {
    return false;
  }
}

function ruleSpecificity(pattern: string): number {
  return pattern.replace(/[*$]/g, '').length;
}

export function parseSitemapUrls(
  xml: string,
  baseUrl: URL,
  limit: number,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const expression = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(xml)) && found.length < limit) {
    const raw = decodeHtmlText(match[1]).trim();
    try {
      const url = new URL(raw, baseUrl);
      url.hash = '';
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        isSameSiteHost(url.hostname, baseUrl.hostname) &&
        url.username === '' &&
        url.password === '' &&
        !seen.has(url.href)
      ) {
        seen.add(url.href);
        found.push(url.href);
      }
    } catch {
      // Invalid sitemap entries are ignored; one malformed URL must not fail the whole audit.
    }
  }
  return found;
}

export function parseHtmlPage(html: string, pageUrl: string): ParsedHtmlPage {
  const url = new URL(pageUrl);
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const titleMatch = cleaned.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch ? normalizedText(titleMatch[1]) : null;
  let description: string | null = null;
  let canonicalUrl: string | null = null;
  let noindex = false;
  let h1Count = 0;
  let h1: string | null = null;
  let imagesMissingAlt = 0;
  let insecureResourceCount = 0;
  const internalLinks: string[] = [];
  const tags = /<([a-z][a-z\d:-]*)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(cleaned))) {
    const tagName = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);
    if (tagName === 'meta') {
      const name = (attributes.name ?? '').toLowerCase();
      const content = attributes.content ?? '';
      if (name === 'description' && description === null) {
        description = normalizedText(content);
      }
      if (
        (name === 'robots' || name === 'googlebot') &&
        /\bnoindex\b/i.test(content)
      ) {
        noindex = true;
      }
    } else if (tagName === 'link' && canonicalUrl === null) {
      const rel = (attributes.rel ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical') && attributes.href) {
        try {
          const canonical = new URL(attributes.href, url);
          canonical.search = '';
          canonical.hash = '';
          canonicalUrl = canonical.href;
        } catch {
          canonicalUrl = null;
        }
      }
    } else if (tagName === 'h1') {
      h1Count += 1;
      if (h1 === null) {
        const body = cleaned
          .slice(tags.lastIndex)
          .match(/^([\s\S]*?)<\/h1\s*>/i);
        h1 = body ? normalizedText(body[1].replace(/<[^>]*>/g, ' ')) : null;
      }
    } else if (
      tagName === 'img' &&
      !Object.prototype.hasOwnProperty.call(attributes, 'alt')
    ) {
      imagesMissingAlt += 1;
    } else if (tagName === 'a' && attributes.href) {
      try {
        const target = new URL(attributes.href, url);
        if (
          target.protocol === url.protocol &&
          isSameSiteHost(target.hostname, url.hostname) &&
          target.username === '' &&
          target.password === ''
        ) {
          target.hash = '';
          if (!target.href.startsWith('mailto:'))
            internalLinks.push(target.href);
        }
      } catch {
        // Invalid links are not treated as pages to crawl.
      }
    }
    if (
      tagName === 'iframe' ||
      tagName === 'script' ||
      tagName === 'img' ||
      tagName === 'link'
    ) {
      const source =
        tagName === 'link' ? (attributes.href ?? '') : (attributes.src ?? '');
      try {
        const target = source ? new URL(source, url) : null;
        if (target?.protocol === 'http:' && url.protocol === 'https:') {
          insecureResourceCount += 1;
        }
      } catch {
        // Invalid resource URLs are not fetched by this auditor.
      }
    }
  }

  return {
    title,
    description,
    h1Count,
    h1,
    imagesMissingAlt,
    canonicalUrl,
    noindex,
    internalLinks: [...new Set(internalLinks)],
    insecureResourceCount,
  };
}

export function decodeHtmlText(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_whole, decimal: string) => {
      const code = Number(decimal);
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([\da-f]+);/gi, (_whole, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    });
}

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const expression =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) {
    const name = match[1].toLowerCase();
    if (name.startsWith('/')) continue;
    result[name] = decodeHtmlText(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function normalizedText(value: string): string | null {
  const text = decodeHtmlText(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return text.length > 0 ? text : null;
}
