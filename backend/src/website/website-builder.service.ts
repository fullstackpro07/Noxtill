import { HttpStatus, Injectable } from '@nestjs/common';
import { ProductKind, WebsitePageKind } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { aiProviderErrorReason } from '../marketing/automations/workflow-agent.util';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteFormsService } from './website-forms.service';
import { WEBSITE_ERRORS, WebsiteService } from './website.service';
import {
  NavItem,
  normalizeBlocks,
  readSettings,
  slugFromTitle,
} from './website-content.util';

export const BUILDER_GOALS = ['sell', 'book', 'lead', 'info'] as const;
export const BUILDER_PAGES = [
  'home',
  'about',
  'products',
  'services',
  'contact',
  'faq',
] as const;
export const BUILDER_TONES = [
  'friendly',
  'professional',
  'premium',
  'playful',
] as const;
type Goal = (typeof BUILDER_GOALS)[number];
type PageKey = (typeof BUILDER_PAGES)[number];

export interface BuilderInput {
  goal: Goal;
  audience?: string;
  tone?: (typeof BUILDER_TONES)[number];
  pages: PageKey[];
  productIds?: string[];
  includeReviews?: boolean;
  useAi?: boolean;
}

/** Placeholder text is bracketed so the editor and publish checklist can flag it as unconfirmed. */
export const PLACEHOLDER = /\[[^\]]{3,}\]/;

/** True when any text value inside the blocks still holds a [placeholder]. */
export function hasPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return PLACEHOLDER.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object')
    return Object.values(value).some(hasPlaceholder);
  return false;
}

const PAGE_TITLES: Record<PageKey, string> = {
  home: 'Home',
  about: 'About us',
  products: 'Shop',
  services: 'Services',
  contact: 'Contact',
  faq: 'FAQ',
};

interface AiCopy {
  tagline: string;
  heroSubheading: string;
  about: string;
}

/**
 * AI Website Builder. The structure is built deterministically from this business's real records
 * (products, services, reviews, phone/address). Optional AI copy is limited to supplied facts and
 * every generated page is a draft: nothing is ever published automatically.
 */
@Injectable()
export class WebsiteBuilderService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly website: WebsiteService,
    private readonly forms: WebsiteFormsService,
    private readonly ai: AiInfraService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async facts(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        name: true,
        phone: true,
        address: true,
        currency: true,
        locale: true,
        slug: true,
      },
    });
    const [productCount, serviceCount, reviewCount, bookingSettings] =
      await Promise.all([
        this.db.product.count({
          where: { businessId, active: true, kind: ProductKind.product },
        }),
        this.db.product.count({
          where: { businessId, active: true, kind: ProductKind.service },
        }),
        this.db.externalReview.count({
          where: { businessId, stars: { gte: 4 }, text: { not: null } },
        }),
        this.prisma.bookingLinkSettings.findUnique({
          where: { businessId },
          select: { businessId: true },
        }),
      ]);
    return {
      business,
      productCount,
      serviceCount,
      reviewCount,
      bookingConfigured: !!bookingSettings,
    };
  }

  async status(businessId: string) {
    const site = await this.website.site(businessId);
    const f = await this.facts(businessId);
    const theme = this.website.draftTheme(site);
    const drafts = await this.db.websitePage.count({
      where: { siteId: site.id, aiDraft: true },
    });
    const totalPages = await this.db.websitePage.count({
      where: { siteId: site.id },
    });
    const checklist = [
      { key: 'name', label: 'Business name', done: !!f.business.name },
      {
        key: 'phone',
        label: 'Phone number (Business profile)',
        done: !!f.business.phone,
      },
      {
        key: 'address',
        label: 'Address (Business profile)',
        done: !!f.business.address,
      },
      {
        key: 'products',
        label: 'Active products (Products)',
        done: f.productCount > 0,
        count: f.productCount,
      },
      {
        key: 'services',
        label: 'Active services (Products)',
        done: f.serviceCount > 0,
        count: f.serviceCount,
      },
      {
        key: 'reviews',
        label: '4★+ reviews with text (Reviews)',
        done: f.reviewCount > 0,
        count: f.reviewCount,
      },
      { key: 'logo', label: 'Logo (Themes & Branding)', done: !!theme.logoUrl },
    ];
    return {
      businessName: f.business.name,
      setupCompletion: Math.round(
        (checklist.filter((c) => c.done).length / checklist.length) * 100,
      ),
      checklist,
      missing: checklist.filter((c) => !c.done).map((c) => c.label),
      draftPagesGenerated: drafts,
      totalPages,
      bookingConfigured: f.bookingConfigured,
      options: {
        goals: BUILDER_GOALS,
        pages: BUILDER_PAGES,
        tones: BUILDER_TONES,
      },
    };
  }

  private async uniqueSlug(
    siteId: string,
    kind: WebsitePageKind,
    base: string,
  ) {
    for (let n = 1; n < 50; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const taken = await this.db.websitePage.findFirst({
        where: { siteId, kind, slug },
        select: { id: true },
      });
      if (!taken) return slug;
    }
    return `${base}-${Date.now()}`;
  }

  private async aiCopy(
    businessId: string,
    input: BuilderInput,
    facts: Awaited<ReturnType<WebsiteBuilderService['facts']>>,
  ): Promise<{ copy: AiCopy | null; status: string }> {
    if (!input.useAi) return { copy: null, status: 'not_requested' };
    const supplied = {
      businessName: facts.business.name,
      goal: input.goal,
      audience: input.audience ?? null,
      tone: input.tone ?? 'friendly',
      activeProducts: facts.productCount,
      activeServices: facts.serviceCount,
      hasAddress: !!facts.business.address,
    };
    try {
      const response = await this.ai.createMessage(
        businessId,
        'website_builder',
        {
          system:
            'You write first-draft website copy for a small business. Use ONLY the supplied facts. Never state prices, numbers, years, awards, ' +
            'certifications, guarantees, locations or claims that are not in the facts. Where a fact is unknown, write around it. ' +
            'Reply with JSON only: {"tagline": string (max 90 chars), "heroSubheading": string (max 200 chars), "about": string (max 600 chars)}.',
          messages: [{ role: 'user', content: JSON.stringify(supplied) }],
          temperature: 0.4,
          maxTokens: 500,
        },
      );
      const raw = response.content.find((b) => b.type === 'text')?.text ?? '';
      const json = JSON.parse(
        raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1),
      ) as Partial<AiCopy>;
      const copy = {
        tagline: String(json.tagline ?? '').slice(0, 90),
        heroSubheading: String(json.heroSubheading ?? '').slice(0, 200),
        about: String(json.about ?? '').slice(0, 600),
      };
      // Any digit the facts don't contain would be an invented number: discard the copy.
      const allowed = JSON.stringify(supplied);
      const digits =
        `${copy.tagline} ${copy.heroSubheading} ${copy.about}`.match(/\d+/g) ??
        [];
      if (digits.some((d) => !allowed.includes(d)))
        return {
          copy: null,
          status:
            'discarded: the AI text contained numbers that are not in your data',
        };
      if (!copy.tagline || !copy.about)
        return {
          copy: null,
          status: 'discarded: the AI returned incomplete text',
        };
      return { copy, status: 'used' };
    } catch (error) {
      if (error instanceof AppException)
        return { copy: null, status: `failed: ${error.message}` };
      return {
        copy: null,
        status: `failed: ${aiProviderErrorReason(error) ?? 'the AI provider could not be reached'}`,
      };
    }
  }

  async generate(businessId: string, actorUserId: string, input: BuilderInput) {
    if (!BUILDER_GOALS.includes(input.goal))
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Choose a site goal.',
        HttpStatus.BAD_REQUEST,
      );
    const pageKeys = [...new Set(input.pages)].filter((p) =>
      BUILDER_PAGES.includes(p),
    );
    if (!pageKeys.length)
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Choose at least one page.',
        HttpStatus.BAD_REQUEST,
      );
    const site = await this.website.site(businessId);
    const facts = await this.facts(businessId);
    let productIds: string[] = [];
    if (input.productIds?.length) {
      const found = await this.db.product.findMany({
        where: {
          businessId,
          active: true,
          id: { in: input.productIds.slice(0, 48) },
        },
        select: { id: true },
      });
      productIds = found.map((p) => p.id);
    }
    const services = pageKeys.includes('services')
      ? await this.db.product.findMany({
          where: { businessId, active: true, kind: ProductKind.service },
          orderBy: { name: 'asc' },
          take: 24,
          select: { id: true },
        })
      : [];
    const ai = await this.aiCopy(businessId, input, facts);
    const name = facts.business.name;

    let contactFormId: string | null = null;
    if (pageKeys.includes('contact') || input.goal === 'lead') {
      const form = await this.forms.create(businessId, actorUserId, {
        name: 'Website contact form',
        fields: [
          { label: 'Your name', type: 'text', required: true, mapTo: 'name' },
          { label: 'Phone', type: 'phone', required: true, mapTo: 'phone' },
          { label: 'Email', type: 'email', required: false, mapTo: 'email' },
          {
            label: 'How can we help?',
            type: 'textarea',
            required: false,
            mapTo: 'notes',
          },
        ],
        consentText: null,
        thankYouMessage: 'Thanks! We will get back to you soon.',
      });
      contactFormId = form.id;
    }

    const slugs = new Map<PageKey, string>();
    for (const key of pageKeys) {
      const base =
        key === 'products'
          ? 'shop'
          : key === 'home'
            ? 'home'
            : slugFromTitle(PAGE_TITLES[key]);
      slugs.set(
        key,
        await this.uniqueSlug(site.id, WebsitePageKind.page, base),
      );
    }
    const productsBlock = (heading: string): Record<string, unknown> =>
      productIds.length
        ? {
            type: 'products',
            heading,
            source: 'selected',
            productIds,
            limit: Math.min(productIds.length, 48),
          }
        : { type: 'products', heading, source: 'all', limit: 12 };
    const reviewsBlock =
      input.includeReviews !== false && facts.reviewCount > 0
        ? [
            {
              type: 'reviews',
              heading: 'What customers say',
              minStars: 4,
              limit: 6,
            },
          ]
        : [];
    const pageBlocks: Record<PageKey, Record<string, unknown>[]> = {
      home: [
        {
          type: 'hero',
          heading: name,
          subheading:
            ai.copy?.heroSubheading ??
            '[Write one sentence about what you offer and who it is for]',
          ctaLabel:
            input.goal === 'sell'
              ? 'Shop now'
              : input.goal === 'book'
                ? 'Book now'
                : 'Get in touch',
          ctaHref:
            input.goal === 'sell' && slugs.has('products')
              ? `/${slugs.get('products')}`
              : input.goal === 'lead' && slugs.has('contact')
                ? `/${slugs.get('contact')}`
                : '',
        },
        ...(input.goal === 'sell' && facts.productCount > 0
          ? [productsBlock('Popular right now')]
          : []),
        ...(input.goal === 'book'
          ? [
              {
                type: 'booking',
                heading: 'Book an appointment',
                body: '',
                ctaLabel: 'Book now',
              },
            ]
          : []),
        ...reviewsBlock,
        {
          type: 'contact',
          heading: 'Find us',
          showPhone: true,
          showAddress: true,
        },
      ],
      about: [
        {
          type: 'text',
          heading: `About ${name}`,
          body:
            ai.copy?.about ??
            '[Tell visitors your story: how you started, what you care about and what makes you different]',
        },
      ],
      products: [productsBlock('All products')],
      services: services.length
        ? [
            {
              type: 'products',
              heading: 'Our services',
              source: 'selected',
              productIds: services.map((s) => s.id),
              limit: services.length,
            },
          ]
        : [
            {
              type: 'text',
              heading: 'Our services',
              body: '[No active services are set up in Products yet. Add them there and this page will list them.]',
            },
          ],
      contact: [
        {
          type: 'contact',
          heading: 'Contact us',
          showPhone: true,
          showAddress: true,
        },
        ...(contactFormId
          ? [
              {
                type: 'form',
                heading: 'Send us a message',
                formId: contactFormId,
              },
            ]
          : []),
      ],
      faq: [
        {
          type: 'faq',
          heading: 'Frequently asked questions',
          items: [
            {
              q: '[Add a question customers often ask]',
              a: '[Add your answer]',
            },
          ],
        },
      ],
    };

    const created: { key: PageKey; id: string; title: string; slug: string }[] =
      [];
    for (const key of pageKeys) {
      const slug = slugs.get(key)!;
      const blocks = normalizeBlocks(pageBlocks[key]);
      const page = await this.website.createPage(
        businessId,
        actorUserId,
        WebsitePageKind.page,
        {
          title: PAGE_TITLES[key],
          slug,
          blocks,
          metaDescription: key === 'home' ? (ai.copy?.tagline ?? null) : null,
          aiDraft: true,
          note:
            ai.status === 'used'
              ? 'Generated draft (AI copy)'
              : 'Generated draft (from business data)',
        },
      );
      created.push({ key, id: page.id, title: page.title, slug: page.slug });
    }

    // Fill an empty draft menu and home-page setting; never overwrite ones the owner already set.
    const nav = this.website.draftNavigation(site);
    if (!nav.header.length) {
      const header: NavItem[] = created
        .filter((c) => c.key !== 'home')
        .map((c, i) => ({
          id: `gen${i + 1}`,
          label: c.title,
          type: 'page',
          pageId: c.id,
        }));
      if (input.goal === 'sell' && !pageKeys.includes('products'))
        header.push({ id: 'genstore', label: 'Shop', type: 'store' });
      if (input.goal === 'book')
        header.push({ id: 'genbook', label: 'Book', type: 'booking' });
      await this.website.saveNavigation(businessId, actorUserId, {
        header,
        footer: nav.footer,
      });
    }
    const settings = readSettings(site.settings);
    const home = created.find((c) => c.key === 'home');
    if (home && !settings.homePageId) {
      await this.website.saveSettings(businessId, actorUserId, {
        homePageId: home.id,
        tagline: settings.tagline || ai.copy?.tagline || '',
      });
    }
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.ai_builder.generated',
      site.id,
      null,
      {
        input: {
          goal: input.goal,
          audience: input.audience ?? null,
          tone: input.tone ?? null,
          pages: pageKeys,
          productIds,
          includeReviews: input.includeReviews !== false,
          useAi: !!input.useAi,
        },
        ai: ai.status,
        pages: created.map((c) => c.id),
      },
    );

    const placeholders = created.filter((c) =>
      hasPlaceholder(pageBlocks[c.key]),
    );
    return {
      pages: created,
      formCreated: contactFormId,
      ai: ai.status,
      pagesNeedingText: placeholders.map((p) => p.title),
      note: 'Every generated page is a draft. Review the text in Pages, replace anything in [brackets], then publish.',
    };
  }
}
