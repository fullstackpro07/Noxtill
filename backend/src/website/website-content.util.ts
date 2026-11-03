/**
 * Website & Commerce content shapes and their validation. Every value saved from the editor goes
 * through these functions, so the public site only ever renders known block types with bounded
 * plain-text fields and safe links (http/https, mailto/tel or a site-relative path). Nothing here
 * is rendered as HTML; the public renderer outputs text nodes only.
 */

export const WEBSITE_BLOCK_TYPES = [
  'hero',
  'text',
  'image',
  'cta',
  'faq',
  'products',
  'reviews',
  'contact',
  'form',
  'booking',
] as const;
export type WebsiteBlockType = (typeof WEBSITE_BLOCK_TYPES)[number];

export type WebsiteBlock = { id: string; type: WebsiteBlockType } & Record<
  string,
  unknown
>;

export const MAX_BLOCKS_PER_PAGE = 40;
const MAX_TEXT = 300;
const MAX_BODY = 8_000;

export class WebsiteContentError extends Error {}

function fail(message: string): never {
  throw new WebsiteContentError(message);
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(`${field} is longer than ${max} characters.`);
  return trimmed;
}

function int(
  value: unknown,
  field: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

/** A link a visitor can follow: http(s), mailto:, tel: or a path on this site. Never javascript:. */
export function safeHref(
  value: unknown,
  field: string,
  required = false,
): string {
  const href = text(value, field, 1000);
  if (!href) {
    if (required) fail(`${field} is required.`);
    return '';
  }
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^(mailto:|tel:)/i.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return url.toString();
  } catch {
    // fall through
  }
  fail(
    `${field} must be a web address (https://…), an email/phone link or a path starting with /.`,
  );
}

export function safeImageUrl(value: unknown, field: string): string {
  const url = text(value, field, 1000);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      return parsed.toString();
  } catch {
    // fall through
  }
  fail(`${field} must be an image web address (https://…).`);
}

function blockId(value: unknown, index: number): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value)
    ? value
    : `b${index + 1}`;
}

function ids(value: unknown, field: string, max = 50): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${field} must be a list.`);
  if (value.length > max) fail(`${field} can hold at most ${max} items.`);
  return value.map((v) => {
    if (typeof v !== 'string' || !v || v.length > 64)
      fail(`${field} has an invalid id.`);
    return v;
  });
}

export function normalizeBlocks(input: unknown): WebsiteBlock[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) fail('Page content must be a list of blocks.');
  if (input.length > MAX_BLOCKS_PER_PAGE) {
    fail(`A page can have at most ${MAX_BLOCKS_PER_PAGE} blocks.`);
  }
  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object') fail(`Block ${index + 1} is invalid.`);
    const b = raw as Record<string, unknown>;
    const type = b.type as WebsiteBlockType;
    if (!WEBSITE_BLOCK_TYPES.includes(type))
      fail(`Block ${index + 1} has an unknown type.`);
    let id = blockId(b.id, index);
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const label = `Block ${index + 1} (${type})`;
    switch (type) {
      case 'hero':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          subheading: text(b.subheading, `${label} subheading`, 600),
          ctaLabel: text(b.ctaLabel, `${label} button label`, 60),
          ctaHref: safeHref(b.ctaHref, `${label} button link`),
          imageUrl: safeImageUrl(b.imageUrl, `${label} image`),
        };
      case 'text':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          body: text(b.body, `${label} text`, MAX_BODY),
        };
      case 'image':
        return {
          id,
          type,
          url:
            safeImageUrl(b.url, `${label} image`) ||
            fail(`${label} needs an image address.`),
          alt: text(b.alt, `${label} alt text`, 200),
          caption: text(b.caption, `${label} caption`),
        };
      case 'cta':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          body: text(b.body, `${label} text`, 1000),
          label: text(b.label, `${label} button label`, 60),
          href: safeHref(b.href, `${label} button link`),
        };
      case 'faq': {
        const items = Array.isArray(b.items) ? b.items : [];
        if (items.length > 30) fail(`${label} can have at most 30 questions.`);
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          items: items.map((item, i) => {
            const it = (item ?? {}) as Record<string, unknown>;
            return {
              q: text(it.q, `${label} question ${i + 1}`),
              a: text(it.a, `${label} answer ${i + 1}`, 2000),
            };
          }),
        };
      }
      case 'products': {
        const source =
          b.source === 'collection' || b.source === 'selected'
            ? b.source
            : 'all';
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          source,
          collectionId:
            source === 'collection'
              ? text(b.collectionId, `${label} collection`, 64)
              : '',
          productIds:
            source === 'selected' ? ids(b.productIds, `${label} products`) : [],
          limit: int(b.limit, `${label} limit`, 1, 48, 12),
        };
      }
      case 'reviews':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          minStars: int(b.minStars, `${label} minimum stars`, 1, 5, 4),
          limit: int(b.limit, `${label} limit`, 1, 12, 6),
        };
      case 'contact':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          showPhone: b.showPhone !== false,
          showAddress: b.showAddress !== false,
        };
      case 'form':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          formId:
            text(b.formId, `${label} form`, 64) ||
            fail(`${label} needs a form.`),
        };
      case 'booking':
        return {
          id,
          type,
          heading: text(b.heading, `${label} heading`),
          body: text(b.body, `${label} text`, 1000),
          ctaLabel: text(b.ctaLabel, `${label} button label`, 60) || 'Book now',
        };
    }
  });
}

/** Dynamic references a block holds, so publish can check they still exist. */
export function blockReferences(blocks: WebsiteBlock[]) {
  const formIds = new Set<string>();
  const collectionIds = new Set<string>();
  const productIds = new Set<string>();
  const internalLinks = new Set<string>();
  for (const b of blocks) {
    if (b.type === 'form' && typeof b.formId === 'string')
      formIds.add(b.formId);
    if (b.type === 'products') {
      if (typeof b.collectionId === 'string' && b.collectionId)
        collectionIds.add(b.collectionId);
      for (const id of (b.productIds as string[]) ?? []) productIds.add(id);
    }
    for (const key of ['ctaHref', 'href'] as const) {
      const href = b[key];
      if (typeof href === 'string' && href.startsWith('/'))
        internalLinks.add(href.split(/[?#]/)[0]);
    }
  }
  return { formIds, collectionIds, productIds, internalLinks };
}

export function normalizeSlug(value: unknown): string {
  const raw = text(value, 'Slug', 160).toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) fail('Slug must contain letters or numbers.');
  if (['blog', 'store', 'search', 'api', '_next'].includes(slug)) {
    fail(`"${slug}" is reserved; choose another slug.`);
  }
  return slug;
}

export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || 'page';
}

// ---------------------------------------------------------------------------------------------
// Navigation

export const NAV_DESTINATION_TYPES = [
  'page',
  'url',
  'store',
  'blog',
  'booking',
  'portal',
] as const;
export type NavDestinationType = (typeof NAV_DESTINATION_TYPES)[number];

export interface NavItem {
  id: string;
  label: string;
  type: NavDestinationType;
  pageId?: string;
  url?: string;
  hidden?: boolean;
  newTab?: boolean;
  children?: NavItem[];
}

export interface WebsiteNavigation {
  header: NavItem[];
  footer: NavItem[];
}

function navItem(raw: unknown, path: string, depth: number): NavItem {
  if (!raw || typeof raw !== 'object') fail(`${path} is invalid.`);
  const r = raw as Record<string, unknown>;
  const type = r.type as NavDestinationType;
  if (!NAV_DESTINATION_TYPES.includes(type))
    fail(`${path} has an unknown destination.`);
  const label = text(r.label, `${path} label`, 60);
  if (!label) fail(`${path} needs a label.`);
  const item: NavItem = {
    id:
      typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.id)
        ? r.id
        : `n${Math.abs(hash(path))}`,
    label,
    type,
    hidden: r.hidden === true,
    newTab: r.newTab === true,
  };
  if (type === 'page') {
    item.pageId =
      text(r.pageId, `${path} page`, 64) || fail(`${path} needs a page.`);
  }
  if (type === 'url') item.url = safeHref(r.url, `${path} link`, true);
  const children = Array.isArray(r.children) ? r.children : [];
  if (children.length) {
    if (depth >= 1) fail(`${path}: menus can only be nested one level deep.`);
    if (children.length > 12) fail(`${path} can have at most 12 sub-items.`);
    item.children = children.map((c, i) =>
      navItem(c, `${path} › item ${i + 1}`, depth + 1),
    );
  }
  return item;
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

export function normalizeNavigation(input: unknown): WebsiteNavigation {
  const r = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const list = (value: unknown, name: string, max: number) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail(`${name} menu must be a list.`);
    if (value.length > max) fail(`${name} menu can have at most ${max} items.`);
    return value.map((item, i) => navItem(item, `${name} item ${i + 1}`, 0));
  };
  const nav = {
    header: list(r.header, 'Header', 12),
    footer: list(r.footer, 'Footer', 20),
  };
  const allIds = [...nav.header, ...nav.footer].flatMap((i) => [
    i.id,
    ...(i.children ?? []).map((c) => c.id),
  ]);
  if (new Set(allIds).size !== allIds.length)
    fail('Menu items must have unique ids.');
  return nav;
}

export function navPageIds(nav: WebsiteNavigation): string[] {
  return [...nav.header, ...nav.footer]
    .flatMap((i) => [i, ...(i.children ?? [])])
    .filter((i) => i.type === 'page' && i.pageId)
    .map((i) => i.pageId!);
}

// ---------------------------------------------------------------------------------------------
// Theme

export const THEME_FONTS = [
  'Inter',
  'Georgia',
  'Merriweather',
  'Poppins',
  'Lora',
  'Roboto',
  'system-ui',
] as const;

export interface WebsiteTheme {
  preset: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
  };
  fontHeading: string;
  fontBody: string;
  radius: number;
  buttonStyle: 'solid' | 'outline';
  headerStyle: 'light' | 'dark' | 'brand';
  layoutWidth: number;
  logoUrl: string;
  faviconUrl: string;
}

export const THEME_PRESETS: Record<
  string,
  Omit<WebsiteTheme, 'logoUrl' | 'faviconUrl'>
> = {
  clean: {
    preset: 'clean',
    colors: {
      primary: '#1d4ed8',
      accent: '#0f766e',
      background: '#ffffff',
      surface: '#f4f6fa',
      text: '#111827',
      muted: '#4b5563',
    },
    fontHeading: 'Inter',
    fontBody: 'Inter',
    radius: 10,
    buttonStyle: 'solid',
    headerStyle: 'light',
    layoutWidth: 1120,
  },
  warm: {
    preset: 'warm',
    colors: {
      primary: '#9a3412',
      accent: '#a16207',
      background: '#fffaf5',
      surface: '#fbefe3',
      text: '#2b1d14',
      muted: '#6b5546',
    },
    fontHeading: 'Lora',
    fontBody: 'Inter',
    radius: 14,
    buttonStyle: 'solid',
    headerStyle: 'light',
    layoutWidth: 1080,
  },
  bold: {
    preset: 'bold',
    colors: {
      primary: '#7c3aed',
      accent: '#db2777',
      background: '#0f0f14',
      surface: '#1b1b24',
      text: '#f4f4f6',
      muted: '#b4b4c2',
    },
    fontHeading: 'Poppins',
    fontBody: 'Inter',
    radius: 6,
    buttonStyle: 'solid',
    headerStyle: 'dark',
    layoutWidth: 1200,
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeTheme(input: unknown): WebsiteTheme {
  const r = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const base =
    THEME_PRESETS[
      typeof r.preset === 'string' && THEME_PRESETS[r.preset]
        ? r.preset
        : 'clean'
    ];
  const c = (
    r.colors && typeof r.colors === 'object' ? r.colors : {}
  ) as Record<string, unknown>;
  const colors = { ...base.colors };
  for (const key of Object.keys(colors) as (keyof WebsiteTheme['colors'])[]) {
    if (c[key] === undefined) continue;
    if (typeof c[key] !== 'string' || !HEX.test(c[key])) {
      fail(`Colour "${key}" must be a hex colour like #1d4ed8.`);
    }
    colors[key] = c[key].toLowerCase();
  }
  const font = (value: unknown, fallback: string, field: string) => {
    if (value === undefined) return fallback;
    if (!THEME_FONTS.includes(value as (typeof THEME_FONTS)[number]))
      fail(`${field} is not an available font.`);
    return value as string;
  };
  return {
    preset: base.preset,
    colors,
    fontHeading: font(r.fontHeading, base.fontHeading, 'Heading font'),
    fontBody: font(r.fontBody, base.fontBody, 'Body font'),
    radius: int(r.radius, 'Corner radius', 0, 24, base.radius),
    buttonStyle:
      r.buttonStyle === 'outline'
        ? 'outline'
        : r.buttonStyle === 'solid'
          ? 'solid'
          : base.buttonStyle,
    headerStyle:
      r.headerStyle === 'dark' ||
      r.headerStyle === 'brand' ||
      r.headerStyle === 'light'
        ? r.headerStyle
        : base.headerStyle,
    layoutWidth: int(
      r.layoutWidth,
      'Layout width',
      880,
      1440,
      base.layoutWidth,
    ),
    logoUrl: safeImageUrl(r.logoUrl, 'Logo'),
    faviconUrl: safeImageUrl(r.faviconUrl, 'Favicon'),
  };
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Readable text colour on a filled button of `background`. */
export function onColor(background: string): string {
  return contrastRatio(background, '#ffffff') >=
    contrastRatio(background, '#111111')
    ? '#ffffff'
    : '#111111';
}

export function themeContrastChecks(theme: WebsiteTheme) {
  const checks = [
    {
      key: 'body_text',
      label: 'Body text on page background',
      fg: theme.colors.text,
      bg: theme.colors.background,
      min: 4.5,
    },
    {
      key: 'muted_text',
      label: 'Secondary text on page background',
      fg: theme.colors.muted,
      bg: theme.colors.background,
      min: 4.5,
    },
    {
      key: 'surface_text',
      label: 'Text on card background',
      fg: theme.colors.text,
      bg: theme.colors.surface,
      min: 4.5,
    },
    {
      key: 'button_text',
      label: 'Button label on primary colour',
      fg: onColor(theme.colors.primary),
      bg: theme.colors.primary,
      min: 4.5,
    },
    {
      key: 'link_text',
      label: 'Primary-colour links on page background',
      fg: theme.colors.primary,
      bg: theme.colors.background,
      min: 4.5,
    },
  ];
  return checks.map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    return {
      key: c.key,
      label: c.label,
      ratio,
      minimum: c.min,
      passes: ratio >= c.min,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Site settings

export interface WebsiteSettings {
  siteName: string;
  tagline: string;
  homePageId: string;
  notFoundPageId: string;
  privacyPageId: string;
  searchEnabled: boolean;
  cookieBannerEnabled: boolean;
  cookieBannerText: string;
  maintenanceMessage: string;
  indexable: boolean;
}

export const DEFAULT_SETTINGS: WebsiteSettings = {
  siteName: '',
  tagline: '',
  homePageId: '',
  notFoundPageId: '',
  privacyPageId: '',
  searchEnabled: true,
  cookieBannerEnabled: false,
  cookieBannerText: '',
  maintenanceMessage: '',
  indexable: true,
};

export function normalizeSettings(
  input: unknown,
  current: WebsiteSettings = DEFAULT_SETTINGS,
): WebsiteSettings {
  const r = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const pick = <K extends keyof WebsiteSettings>(
    key: K,
    read: (v: unknown) => WebsiteSettings[K],
  ) => (r[key] === undefined ? current[key] : read(r[key]));
  const bool = (key: string) => (v: unknown) => {
    if (typeof v !== 'boolean') fail(`${key} must be on or off.`);
    return v;
  };
  return {
    siteName: pick('siteName', (v) => text(v, 'Site name', 120)),
    tagline: pick('tagline', (v) => text(v, 'Tagline', 200)),
    homePageId: pick('homePageId', (v) => text(v, 'Home page', 64)),
    notFoundPageId: pick('notFoundPageId', (v) =>
      text(v, 'Not-found page', 64),
    ),
    privacyPageId: pick('privacyPageId', (v) => text(v, 'Privacy page', 64)),
    searchEnabled: pick('searchEnabled', bool('Search')),
    cookieBannerEnabled: pick('cookieBannerEnabled', bool('Cookie banner')),
    cookieBannerText: pick('cookieBannerText', (v) =>
      text(v, 'Cookie banner text', 600),
    ),
    maintenanceMessage: pick('maintenanceMessage', (v) =>
      text(v, 'Maintenance message', 600),
    ),
    indexable: pick('indexable', bool('Search-engine indexing')),
  };
}

export function readSettings(stored: unknown): WebsiteSettings {
  try {
    return normalizeSettings(stored, DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ---------------------------------------------------------------------------------------------
// Storefront options. Stored under `settings.storefront`; unlike the site settings above they are
// operational and apply to the public store immediately (no publish step).

export interface StorefrontOptions {
  showPrices: boolean;
  outOfStockBehavior: 'hide' | 'show_unavailable';
  checkoutEnabled: boolean;
}

export const DEFAULT_STOREFRONT: StorefrontOptions = {
  showPrices: true,
  outOfStockBehavior: 'show_unavailable',
  checkoutEnabled: true,
};

export function readStorefront(stored: unknown): StorefrontOptions {
  const s = (
    stored && typeof stored === 'object'
      ? (stored as Record<string, unknown>).storefront
      : null
  ) as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') return DEFAULT_STOREFRONT;
  return {
    showPrices:
      typeof s.showPrices === 'boolean'
        ? s.showPrices
        : DEFAULT_STOREFRONT.showPrices,
    outOfStockBehavior:
      s.outOfStockBehavior === 'hide' ? 'hide' : 'show_unavailable',
    checkoutEnabled:
      typeof s.checkoutEnabled === 'boolean'
        ? s.checkoutEnabled
        : DEFAULT_STOREFRONT.checkoutEnabled,
  };
}

export function normalizeStorefront(
  input: unknown,
  current: StorefrontOptions,
): StorefrontOptions {
  const r = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const bool = (key: keyof StorefrontOptions, label: string) => {
    if (r[key] === undefined) return current[key] as boolean;
    if (typeof r[key] !== 'boolean') fail(`${label} must be on or off.`);
    return r[key];
  };
  let outOfStockBehavior = current.outOfStockBehavior;
  if (r.outOfStockBehavior !== undefined) {
    if (
      r.outOfStockBehavior !== 'hide' &&
      r.outOfStockBehavior !== 'show_unavailable'
    )
      fail('Out-of-stock behaviour is invalid.');
    outOfStockBehavior = r.outOfStockBehavior;
  }
  return {
    showPrices: bool('showPrices', 'Show prices'),
    outOfStockBehavior,
    checkoutEnabled: bool('checkoutEnabled', 'Online checkout'),
  };
}
