import { Injectable, Logger } from '@nestjs/common';
import { ProductKind, WebsitePageKind } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { S3Service } from '../common/storage/s3.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteBlock, NavItem, readStorefront } from './website-content.util';
import { SnapshotPage, WebsiteSnapshot, pagePath } from './website.service';
import { WebsiteFormsService } from './website-forms.service';

type Business = Awaited<ReturnType<PrismaService['business']['findUnique']>> &
  object;

/**
 * Public renderer for the hosted site (`/site/<businessSlug>/...`). No auth: every query here is
 * scoped explicitly to the business resolved from the slug, and only the live deployment
 * snapshot is ever served. Dynamic blocks are resolved against canonical records at request time.
 */
@Injectable()
export class WebsitePublicService {
  private readonly logger = new Logger(WebsitePublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forms: WebsiteFormsService,
    private readonly s3: S3Service,
  ) {}

  async render(slug: string, rawPath: string, query?: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) return { state: 'not_found' as const };
    const site = await this.prisma.websiteSite.findUnique({
      where: { businessId: business.id },
    });
    const deployment = site?.liveDeploymentId
      ? await this.prisma.websiteDeployment.findFirst({
          where: { id: site.liveDeploymentId, businessId: business.id },
        })
      : null;
    if (!site || !deployment)
      return { state: 'not_published' as const, businessName: business.name };
    const snapshot = deployment.snapshot as unknown as WebsiteSnapshot;
    const path = this.cleanPath(rawPath);

    if (site.maintenanceMode) {
      return {
        state: 'maintenance' as const,
        businessName: business.name,
        message:
          snapshot.settings.maintenanceMessage ||
          'We are making some updates and will be back shortly.',
        theme: snapshot.theme,
      };
    }

    const redirect = await this.prisma.websiteRedirect.findFirst({
      where: { siteId: site.id, fromPath: path.toLowerCase() },
    });
    if (redirect) {
      const to = redirect.toPath.startsWith('/')
        ? `/site/${slug}${redirect.toPath === '/' ? '' : redirect.toPath}`
        : redirect.toPath;
      return { state: 'redirect' as const, to, permanent: redirect.permanent };
    }

    const shell = this.shell(business, slug, snapshot);
    const pages = snapshot.pages;
    const { settings } = snapshot;

    if (path === '/blog') {
      const posts = pages
        .filter((p) => p.kind === WebsitePageKind.post)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map((p) => this.postCard(p));
      return {
        state: 'ok' as const,
        ...shell,
        view: { type: 'blog_index' as const, title: 'Blog', posts },
      };
    }
    if (path === '/search') {
      if (!settings.searchEnabled)
        return {
          state: 'ok' as const,
          ...shell,
          view: this.notFoundView(snapshot),
        };
      const q = (query ?? '').trim().toLowerCase().slice(0, 100);
      const results = q
        ? pages
            .filter((p) =>
              [
                p.title,
                p.excerpt ?? '',
                p.metaDescription ?? '',
                ...p.blocks.map((b) =>
                  [b.heading, b.body, b.subheading]
                    .filter((x) => typeof x === 'string')
                    .join(' '),
                ),
              ]
                .join(' ')
                .toLowerCase()
                .includes(q),
            )
            .slice(0, 30)
            .map((p) => ({
              title: p.title,
              path: this.href(
                slug,
                pagePath(p.kind, p.slug, settings.homePageId, p.id),
              ),
              excerpt: p.excerpt ?? p.metaDescription ?? null,
            }))
        : [];
      return {
        state: 'ok' as const,
        ...shell,
        view: { type: 'search' as const, title: 'Search', query: q, results },
      };
    }

    let page: SnapshotPage | undefined;
    if (path === '/') {
      page =
        pages.find((p) => p.id === settings.homePageId) ??
        pages.find((p) => p.kind === WebsitePageKind.page);
    } else if (path.startsWith('/blog/')) {
      page = pages.find(
        (p) => p.kind === WebsitePageKind.post && `/blog/${p.slug}` === path,
      );
    } else if (path.startsWith('/lp/')) {
      page = pages.find(
        (p) => p.kind === WebsitePageKind.landing && `/lp/${p.slug}` === path,
      );
    } else {
      page = pages.find(
        (p) => p.kind === WebsitePageKind.page && `/${p.slug}` === path,
      );
    }
    if (!page)
      return {
        state: 'ok' as const,
        status: 404,
        ...shell,
        view: this.notFoundView(snapshot),
      };
    return {
      state: 'ok' as const,
      ...shell,
      view: await this.pageView(business, slug, page, snapshot),
    };
  }

  private cleanPath(raw: string) {
    const path = `/${(raw ?? '').split(/[?#]/)[0]}`
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');
    return path || '/';
  }

  private href(slug: string, path: string) {
    return `/site/${slug}${path === '/' ? '' : path}`;
  }

  private navHref(
    slug: string,
    item: NavItem,
    snapshot: WebsiteSnapshot,
  ): string | null {
    switch (item.type) {
      case 'page': {
        const page = snapshot.pages.find((p) => p.id === item.pageId);
        return page
          ? this.href(
              slug,
              pagePath(
                page.kind,
                page.slug,
                snapshot.settings.homePageId,
                page.id,
              ),
            )
          : null;
      }
      case 'url':
        return item.url!.startsWith('/')
          ? this.href(slug, item.url!)
          : item.url!;
      case 'store':
        return `/store/${slug}`;
      case 'blog':
        return this.href(slug, '/blog');
      case 'booking':
        return `/book/${slug}`;
      case 'portal':
        return `/portal/${slug}`;
    }
  }

  private shell(business: Business, slug: string, snapshot: WebsiteSnapshot) {
    const map = (items: NavItem[]) =>
      items
        .filter((i) => !i.hidden)
        .map((i) => ({
          label: i.label,
          href: this.navHref(slug, i, snapshot),
          newTab: !!i.newTab,
          children: (i.children ?? [])
            .filter((c) => !c.hidden)
            .map((c) => ({
              label: c.label,
              href: this.navHref(slug, c, snapshot),
              newTab: !!c.newTab,
            })),
        }));
    const privacy = snapshot.pages.find(
      (p) => p.id === snapshot.settings.privacyPageId,
    );
    return {
      site: {
        name: snapshot.settings.siteName || business.name,
        tagline: snapshot.settings.tagline,
        homeHref: this.href(slug, '/'),
        searchHref: snapshot.settings.searchEnabled
          ? this.href(slug, '/search')
          : null,
        indexable: snapshot.settings.indexable,
        locale: business.locale,
        cookieBanner: snapshot.settings.cookieBannerEnabled
          ? {
              text:
                snapshot.settings.cookieBannerText ||
                'This site uses cookies that are needed for it to work.',
              privacyHref: privacy ? this.href(slug, `/${privacy.slug}`) : null,
            }
          : null,
      },
      theme: snapshot.theme,
      navigation: {
        header: map(snapshot.navigation.header),
        footer: map(snapshot.navigation.footer),
      },
    };
  }

  private postCard(p: SnapshotPage) {
    return {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      heroImageUrl: p.heroImageUrl,
      category: p.category,
      tags: p.tags,
      publishedAt: p.publishedAt,
    };
  }

  private notFoundView(snapshot: WebsiteSnapshot) {
    const custom = snapshot.pages.find(
      (p) => p.id === snapshot.settings.notFoundPageId,
    );
    return {
      type: 'not_found' as const,
      title: custom?.title ?? 'Page not found',
      blocks: custom?.blocks ?? [],
    };
  }

  private async pageView(
    business: Business,
    slug: string,
    page: SnapshotPage,
    snapshot: WebsiteSnapshot,
  ) {
    const blocks = await Promise.all(
      page.blocks.map((b) => this.resolveBlock(business, slug, b)),
    );
    return {
      type:
        page.kind === WebsitePageKind.post
          ? ('post' as const)
          : ('page' as const),
      pageId: page.id,
      kind: page.kind,
      title: page.title,
      metaTitle: page.metaTitle || page.title,
      metaDescription: page.metaDescription || page.excerpt || null,
      heroImageUrl: page.heroImageUrl,
      category: page.category,
      tags: page.tags,
      publishedAt: page.publishedAt,
      blocks: blocks.filter(Boolean),
      notFoundBlocks: undefined,
      settingsHome: snapshot.settings.homePageId === page.id,
    };
  }

  /** Resolves a block's live data; returns a public-safe shape (never cost, stock counts or PII). */
  private async resolveBlock(
    business: Business,
    slug: string,
    block: WebsiteBlock,
  ) {
    try {
      switch (block.type) {
        case 'products':
          return { ...block, products: await this.products(business, block) };
        case 'reviews': {
          const reviews = await this.prisma.externalReview.findMany({
            where: {
              businessId: business.id,
              stars: { gte: block.minStars as number },
              text: { not: null },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: block.limit as number,
            select: {
              author: true,
              stars: true,
              text: true,
              platform: true,
              createdAt: true,
            },
          });
          return {
            ...block,
            reviews: reviews.map((r) => ({
              author: r.author ? r.author.split(' ')[0] : 'Customer',
              stars: r.stars,
              text: r.text,
              platform: r.platform,
            })),
          };
        }
        case 'contact':
          return {
            ...block,
            contact: {
              phone: block.showPhone ? business.phone : null,
              address: block.showAddress ? business.address : null,
            },
          };
        case 'form':
          return {
            ...block,
            form: await this.forms.publicFormById(
              business.id,
              block.formId as string,
            ),
          };
        case 'booking':
          return { ...block, href: `/book/${slug}` };
        case 'hero':
        case 'cta': {
          const key = block.type === 'hero' ? 'ctaHref' : 'href';
          const href = block[key] as string;
          return {
            ...block,
            [key]: href && href.startsWith('/') ? this.href(slug, href) : href,
          };
        }
        default:
          return block;
      }
    } catch (error) {
      this.logger.warn(
        `Block ${block.id} (${block.type}) failed to resolve: ${(error as Error).message}`,
      );
      return { ...block, unavailable: true };
    }
  }

  private async products(business: Business, block: WebsiteBlock) {
    const site = await this.prisma.websiteSite.findUnique({
      where: { businessId: business.id },
      select: { settings: true },
    });
    const options = readStorefront(site?.settings);
    const allowNegativeStock = resolvePolicies(business).bool(
      'sales.allowNegativeStock',
    );
    let ids: string[] | null = null;
    if (block.source === 'collection') {
      const collection = await this.prisma.websiteCollection.findFirst({
        where: {
          id: block.collectionId as string,
          businessId: business.id,
          visible: true,
        },
      });
      ids = collection ? ((collection.productIds as string[]) ?? []) : [];
    } else if (block.source === 'selected') {
      ids = block.productIds as string[];
    }
    const [products, settings] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          businessId: business.id,
          active: true,
          ...(ids ? { id: { in: ids } } : {}),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          category: true,
          kind: true,
          sellingPrice: true,
          stockQty: true,
          photoKey: true,
        },
      }),
      this.prisma.websiteProductSetting.findMany({
        where: { businessId: business.id },
      }),
    ]);
    const byId = new Map(settings.map((s) => [s.productId, s]));
    const order = ids ? new Map(ids.map((id, i) => [id, i])) : null;
    const shown = products
      .filter((p) => byId.get(p.id)?.visible !== false)
      .map((p) => ({
        p,
        s: byId.get(p.id),
        available:
          p.kind === ProductKind.service ||
          p.stockQty > 0 ||
          allowNegativeStock,
      }))
      .filter(
        (x) => x.available || options.outOfStockBehavior === 'show_unavailable',
      )
      .sort((a, b) =>
        order
          ? order.get(a.p.id)! - order.get(b.p.id)!
          : (b.s?.sortPriority ?? 0) - (a.s?.sortPriority ?? 0),
      )
      .slice(0, block.limit as number);
    return Promise.all(
      shown.map(async ({ p, s, available }) => ({
        id: p.id,
        name: s?.webTitle || p.name,
        summary: s?.webSummary ?? null,
        badge: s?.badge ?? null,
        category: p.category,
        price: options.showPrices ? Number(p.sellingPrice) : null,
        currency: business.currency,
        available,
        imageUrl: p.photoKey
          ? await this.s3
              .getSignedDownloadUrl(p.photoKey, 3600)
              .catch(() => null)
          : null,
      })),
    );
  }

  /** Public form schema by token (used by the standalone embed endpoint). */
  publicForm(token: string) {
    return this.forms.publicForm(token);
  }
}
