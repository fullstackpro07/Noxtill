import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  Prisma,
  WebsiteDeploymentKind,
  WebsitePage,
  WebsitePageKind,
  WebsitePageStatus,
  WebsiteSite,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  WebsiteBlock,
  WebsiteContentError,
  WebsiteNavigation,
  WebsiteSettings,
  WebsiteTheme,
  blockReferences,
  navPageIds,
  normalizeBlocks,
  normalizeNavigation,
  normalizeSettings,
  normalizeSlug,
  normalizeTheme,
  readSettings,
  safeImageUrl,
  slugFromTitle,
  themeContrastChecks,
} from './website-content.util';

/** One page as it is live: a frozen copy taken when it was published. */
export interface SnapshotPage {
  id: string;
  kind: WebsitePageKind;
  title: string;
  slug: string;
  version: number;
  blocks: WebsiteBlock[];
  metaTitle: string | null;
  metaDescription: string | null;
  excerpt: string | null;
  heroImageUrl: string | null;
  category: string | null;
  tags: string[];
  showInHeader: boolean;
  goal: string | null;
  campaignId: string | null;
  publishedAt: string;
}

export interface WebsiteSnapshot {
  pages: SnapshotPage[];
  navigation: WebsiteNavigation;
  theme: WebsiteTheme;
  settings: WebsiteSettings;
}

export const WEBSITE_ERRORS = {
  INVALID: 'WEBSITE_INVALID_CONTENT',
  NOT_FOUND: 'WEBSITE_NOT_FOUND',
  SLUG_TAKEN: 'WEBSITE_SLUG_TAKEN',
  PUBLISH_BLOCKED: 'WEBSITE_PUBLISH_BLOCKED',
  CONFLICT: 'WEBSITE_CONFLICT',
} as const;

export function invalid(error: unknown): never {
  if (error instanceof WebsiteContentError) {
    throw new AppException(
      WEBSITE_ERRORS.INVALID,
      error.message,
      HttpStatus.BAD_REQUEST,
    );
  }
  throw error;
}

export function notFound(what: string): never {
  throw new AppException(
    WEBSITE_ERRORS.NOT_FOUND,
    `${what} not found.`,
    HttpStatus.NOT_FOUND,
  );
}

/** Public path of a page on the hosted site (relative to /site/<businessSlug>). */
export function pagePath(
  kind: WebsitePageKind,
  slug: string,
  homePageId?: string,
  pageId?: string,
) {
  if (kind === WebsitePageKind.post) return `/blog/${slug}`;
  if (kind === WebsitePageKind.landing) return `/lp/${slug}`;
  if (homePageId && pageId === homePageId) return '/';
  return `/${slug}`;
}

export interface PageInput {
  title?: string;
  slug?: string;
  blocks?: unknown;
  metaTitle?: string | null;
  metaDescription?: string | null;
  excerpt?: string | null;
  heroImageUrl?: string | null;
  category?: string | null;
  tags?: string[];
  showInHeader?: boolean;
  campaignId?: string | null;
  goal?: string | null;
  goalTarget?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  publishAt?: string | null;
  note?: string;
}

const LANDING_GOALS = ['form', 'product', 'booking', 'contact'];

/** The interactive-transaction client of the tenant-scoped Prisma client. */
type TenantTx = Parameters<
  Parameters<TenantPrismaService['client']['$transaction']>[0]
>[0];

@Injectable()
export class WebsiteService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  /** The business's site, created on first use (empty draft, nothing published). */
  async site(businessId: string): Promise<WebsiteSite> {
    const existing = await this.db.websiteSite.findFirst({
      where: { businessId },
    });
    if (existing) return existing;
    try {
      return await this.db.websiteSite.create({
        data: { businessId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.db.websiteSite.findFirstOrThrow({ where: { businessId } });
      }
      throw error;
    }
  }

  async liveSnapshot(site: WebsiteSite): Promise<WebsiteSnapshot | null> {
    if (!site.liveDeploymentId) return null;
    const deployment = await this.db.websiteDeployment.findFirst({
      where: { id: site.liveDeploymentId },
    });
    return deployment
      ? (deployment.snapshot as unknown as WebsiteSnapshot)
      : null;
  }

  draftTheme(site: WebsiteSite): WebsiteTheme {
    try {
      return normalizeTheme(site.draftTheme);
    } catch {
      return normalizeTheme({});
    }
  }

  draftNavigation(site: WebsiteSite): WebsiteNavigation {
    try {
      return normalizeNavigation(site.draftNavigation);
    } catch {
      return { header: [], footer: [] };
    }
  }

  async businessSummary(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    });
  }

  // -------------------------------------------------------------------------------------------
  // Pages

  async listPages(businessId: string, kind?: WebsitePageKind) {
    const site = await this.site(businessId);
    const settings = readSettings(site.settings);
    const pages = await this.db.websitePage.findMany({
      where: { businessId, siteId: site.id, ...(kind ? { kind } : {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const authors = await this.authorNames(
      businessId,
      pages.map((p) => p.authorUserId),
    );
    return pages.map((page) => ({
      ...this.pageSummary(page, settings),
      authorName: page.authorUserId
        ? (authors.get(page.authorUserId) ?? null)
        : null,
    }));
  }

  private pageSummary(page: WebsitePage, settings: WebsiteSettings) {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    return {
      id: page.id,
      kind: page.kind,
      title: page.title,
      slug: page.slug,
      path: pagePath(page.kind, page.slug, settings.homePageId, page.id),
      status: page.status,
      version: page.version,
      publishedVersion: page.publishedVersion,
      hasUnpublishedChanges:
        page.status === WebsitePageStatus.published &&
        page.publishedVersion !== page.version,
      blockCount: blocks.length,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      excerpt: page.excerpt,
      heroImageUrl: page.heroImageUrl,
      category: page.category,
      tags: Array.isArray(page.tags) ? (page.tags as string[]) : [],
      showInHeader: page.showInHeader,
      campaignId: page.campaignId,
      goal: page.goal,
      goalTarget: page.goalTarget,
      utmSource: page.utmSource,
      utmMedium: page.utmMedium,
      utmCampaign: page.utmCampaign,
      aiDraft: page.aiDraft,
      publishAt: page.publishAt,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      authorUserId: page.authorUserId,
    };
  }

  private async authorNames(businessId: string, userIds: (string | null)[]) {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async getPage(businessId: string, pageId: string) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    const versions = await this.db.websitePageVersion.findMany({
      where: { pageId },
      orderBy: { version: 'desc' },
      take: 30,
      select: {
        version: true,
        title: true,
        actorUserId: true,
        note: true,
        createdAt: true,
      },
    });
    const actors = await this.authorNames(
      businessId,
      versions.map((v) => v.actorUserId),
    );
    return {
      ...this.pageSummary(page, readSettings(site.settings)),
      blocks: page.blocks,
      versions: versions.map((v) => ({
        ...v,
        actorName: v.actorUserId ? (actors.get(v.actorUserId) ?? null) : null,
      })),
    };
  }

  private async validateCampaign(
    businessId: string,
    campaignId: string | null | undefined,
  ) {
    if (!campaignId) return null;
    const campaign = await this.db.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: { id: true },
    });
    if (!campaign) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'That campaign does not exist in this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return campaign.id;
  }

  private pageFields(kind: WebsitePageKind, input: PageInput) {
    const data: Prisma.WebsitePageUncheckedUpdateInput = {};
    const str = (v: string | null | undefined, max: number, label: string) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const t = v.trim();
      if (t.length > max)
        throw new WebsiteContentError(
          `${label} is longer than ${max} characters.`,
        );
      return t || null;
    };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new WebsiteContentError('Title is required.');
      if (title.length > 200)
        throw new WebsiteContentError('Title is longer than 200 characters.');
      data.title = title;
    }
    if (input.slug !== undefined) data.slug = normalizeSlug(input.slug);
    if (input.blocks !== undefined)
      data.blocks = normalizeBlocks(
        input.blocks,
      ) as unknown as Prisma.InputJsonValue;
    if (input.metaTitle !== undefined)
      data.metaTitle = str(input.metaTitle, 200, 'Meta title');
    if (input.metaDescription !== undefined)
      data.metaDescription = str(
        input.metaDescription,
        320,
        'Meta description',
      );
    if (input.excerpt !== undefined)
      data.excerpt = str(input.excerpt, 1000, 'Excerpt');
    if (input.heroImageUrl !== undefined)
      data.heroImageUrl = input.heroImageUrl
        ? safeImageUrl(input.heroImageUrl, 'Hero image') || null
        : null;
    if (input.category !== undefined)
      data.category = str(input.category, 80, 'Category');
    if (input.tags !== undefined) {
      if (input.tags.length > 20)
        throw new WebsiteContentError('A post can have at most 20 tags.');
      data.tags = [
        ...new Set(
          input.tags
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => t.slice(0, 40)),
        ),
      ];
    }
    if (input.showInHeader !== undefined)
      data.showInHeader = input.showInHeader;
    if (kind === WebsitePageKind.landing) {
      if (input.goal !== undefined) {
        if (input.goal !== null && !LANDING_GOALS.includes(input.goal)) {
          throw new WebsiteContentError(
            'Goal must be form, product, booking or contact.',
          );
        }
        data.goal = input.goal;
      }
      if (input.goalTarget !== undefined)
        data.goalTarget = str(input.goalTarget, 200, 'Goal target');
      if (input.utmSource !== undefined)
        data.utmSource = str(input.utmSource, 80, 'UTM source');
      if (input.utmMedium !== undefined)
        data.utmMedium = str(input.utmMedium, 80, 'UTM medium');
      if (input.utmCampaign !== undefined)
        data.utmCampaign = str(input.utmCampaign, 120, 'UTM campaign');
    }
    return data;
  }

  async createPage(
    businessId: string,
    actorUserId: string,
    kind: WebsitePageKind,
    input: PageInput & { aiDraft?: boolean },
  ) {
    const site = await this.site(businessId);
    let data: Prisma.WebsitePageUncheckedUpdateInput;
    try {
      data = this.pageFields(kind, {
        ...input,
        slug: input.slug ?? slugFromTitle(input.title ?? ''),
      });
      if (!data.title) throw new WebsiteContentError('Title is required.');
    } catch (error) {
      invalid(error);
    }
    if (kind === WebsitePageKind.landing)
      data.campaignId = await this.validateCampaign(
        businessId,
        input.campaignId,
      );
    const blocks = (data.blocks ?? []) as Prisma.InputJsonValue;
    try {
      return await this.db.$transaction(async (tx) => {
        const page = await tx.websitePage.create({
          data: {
            ...(data as Prisma.WebsitePageUncheckedCreateInput),
            businessId,
            siteId: site.id,
            kind,
            blocks,
            authorUserId: actorUserId,
            aiDraft: input.aiDraft === true,
            version: 1,
          },
        });
        await tx.websitePageVersion.create({
          data: {
            businessId,
            pageId: page.id,
            version: 1,
            title: page.title,
            blocks,
            metaTitle: page.metaTitle,
            metaDescription: page.metaDescription,
            actorUserId,
            note: input.note ?? (input.aiDraft ? 'Generated draft' : 'Created'),
          },
        });
        await this.audit(
          tx,
          businessId,
          actorUserId,
          `website.${kind}.created`,
          page.id,
          null,
          { title: page.title, slug: page.slug },
        );
        return page;
      });
    } catch (error) {
      this.rethrowSlug(error);
    }
  }

  private rethrowSlug(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppException(
        WEBSITE_ERRORS.SLUG_TAKEN,
        'Another page of this type already uses that slug.',
        HttpStatus.CONFLICT,
      );
    }
    throw error;
  }

  async updatePage(
    businessId: string,
    actorUserId: string,
    pageId: string,
    input: PageInput,
  ) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    let data: Prisma.WebsitePageUncheckedUpdateInput;
    try {
      data = this.pageFields(page.kind, input);
    } catch (error) {
      invalid(error);
    }
    if (
      page.kind === WebsitePageKind.landing &&
      input.campaignId !== undefined
    ) {
      data.campaignId = await this.validateCampaign(
        businessId,
        input.campaignId,
      );
    }
    const contentChanged = [
      'title',
      'blocks',
      'metaTitle',
      'metaDescription',
    ].some((k) => k in data);
    try {
      return await this.db.$transaction(async (tx) => {
        const version = contentChanged ? page.version + 1 : page.version;
        const updated = await tx.websitePage.update({
          where: { id: page.id },
          data: {
            ...data,
            version,
            aiDraft: contentChanged ? false : page.aiDraft,
          },
        });
        if (contentChanged) {
          await tx.websitePageVersion.create({
            data: {
              businessId,
              pageId: page.id,
              version,
              title: updated.title,
              blocks: updated.blocks as Prisma.InputJsonValue,
              metaTitle: updated.metaTitle,
              metaDescription: updated.metaDescription,
              actorUserId,
              note: input.note?.slice(0, 200) ?? 'Edited',
            },
          });
        }
        return updated;
      });
    } catch (error) {
      this.rethrowSlug(error);
    }
  }

  async restoreVersion(
    businessId: string,
    actorUserId: string,
    pageId: string,
    version: number,
  ) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    const source = await this.db.websitePageVersion.findFirst({
      where: { pageId, version },
    });
    if (!source) notFound('Version');
    const updated = await this.updatePage(businessId, actorUserId, pageId, {
      title: source.title,
      blocks: source.blocks,
      metaTitle: source.metaTitle,
      metaDescription: source.metaDescription,
      note: `Restored version ${version}`,
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      `website.${page.kind}.restored`,
      page.id,
      { version: page.version },
      { restoredFrom: version, version: updated.version },
    );
    return updated;
  }

  async duplicatePage(businessId: string, actorUserId: string, pageId: string) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    for (let n = 2; n < 50; n++) {
      const slug = `${page.slug}-copy${n === 2 ? '' : `-${n - 1}`}`.slice(
        0,
        160,
      );
      const taken = await this.db.websitePage.findFirst({
        where: { siteId: site.id, kind: page.kind, slug },
        select: { id: true },
      });
      if (taken) continue;
      return this.createPage(businessId, actorUserId, page.kind, {
        title: `${page.title} (copy)`.slice(0, 200),
        slug,
        blocks: page.blocks,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        excerpt: page.excerpt,
        heroImageUrl: page.heroImageUrl,
        category: page.category,
        tags: Array.isArray(page.tags) ? (page.tags as string[]) : [],
        campaignId: page.campaignId,
        goal: page.goal,
        goalTarget: page.goalTarget,
        note: `Duplicated from "${page.title}"`,
      });
    }
    throw new AppException(
      WEBSITE_ERRORS.CONFLICT,
      'Too many copies of this page already exist.',
      HttpStatus.CONFLICT,
    );
  }

  async deletePage(businessId: string, actorUserId: string, pageId: string) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    if (page.status === WebsitePageStatus.published) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'Unpublish this page before deleting it.',
        HttpStatus.CONFLICT,
      );
    }
    const nav = this.draftNavigation(site);
    if (navPageIds(nav).includes(page.id)) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'This page is in a menu. Remove it from Navigation first.',
        HttpStatus.CONFLICT,
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.websitePageVersion.deleteMany({ where: { pageId: page.id } });
      await tx.websitePage.delete({ where: { id: page.id } });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        `website.${page.kind}.deleted`,
        page.id,
        { title: page.title, slug: page.slug },
        null,
      );
    });
    return { deleted: true };
  }

  async schedulePage(
    businessId: string,
    actorUserId: string,
    pageId: string,
    publishAt: string | null,
  ) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    if (publishAt === null) {
      if (page.status !== WebsitePageStatus.scheduled) return page;
      return this.db.websitePage.update({
        where: { id: page.id },
        data: { status: WebsitePageStatus.draft, publishAt: null },
      });
    }
    const when = new Date(publishAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Pick a publish time at least a minute from now.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (page.status === WebsitePageStatus.published) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'This page is already live; publish changes directly.',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertPagePublishable(businessId, site, page);
    const updated = await this.db.websitePage.update({
      where: { id: page.id },
      data: { status: WebsitePageStatus.scheduled, publishAt: when },
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      `website.${page.kind}.scheduled`,
      page.id,
      null,
      { publishAt: when.toISOString() },
    );
    return updated;
  }

  /** Checks the references a page's blocks rely on still exist before it can go live. */
  private async assertPagePublishable(
    businessId: string,
    site: WebsiteSite,
    page: WebsitePage,
  ) {
    const blocks = normalizeBlocks(page.blocks);
    const problems: string[] = [];
    if (!blocks.length) problems.push('The page has no content blocks.');
    const refs = blockReferences(blocks);
    if (refs.formIds.size) {
      const forms = await this.db.websiteForm.findMany({
        where: {
          siteId: site.id,
          id: { in: [...refs.formIds] },
          status: 'active',
        },
        select: { id: true },
      });
      if (forms.length !== refs.formIds.size)
        problems.push(
          'A form block points to a form that is missing or disabled.',
        );
    }
    if (refs.collectionIds.size) {
      const collections = await this.db.websiteCollection.findMany({
        where: { businessId, id: { in: [...refs.collectionIds] } },
        select: { id: true },
      });
      if (collections.length !== refs.collectionIds.size)
        problems.push(
          'A products block points to a collection that no longer exists.',
        );
    }
    if (refs.productIds.size) {
      const products = await this.db.product.findMany({
        where: { businessId, id: { in: [...refs.productIds] }, active: true },
        select: { id: true },
      });
      if (products.length !== refs.productIds.size)
        problems.push(
          'A products block lists a product that is inactive or deleted.',
        );
    }
    if (problems.length) {
      throw new AppException(
        WEBSITE_ERRORS.PUBLISH_BLOCKED,
        problems.join(' '),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return blocks;
  }

  private snapshotPage(
    page: WebsitePage,
    blocks: WebsiteBlock[],
    publishedAt: Date,
  ): SnapshotPage {
    return {
      id: page.id,
      kind: page.kind,
      title: page.title,
      slug: page.slug,
      version: page.version,
      blocks,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      excerpt: page.excerpt,
      heroImageUrl: page.heroImageUrl,
      category: page.category,
      tags: Array.isArray(page.tags) ? (page.tags as string[]) : [],
      showInHeader: page.showInHeader,
      goal: page.goal,
      campaignId: page.campaignId,
      publishedAt: publishedAt.toISOString(),
    };
  }

  async publishPage(
    businessId: string,
    actorUserId: string | null,
    pageId: string,
  ) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    const blocks = await this.assertPagePublishable(businessId, site, page);
    const now = new Date();
    const live = await this.liveSnapshot(site);
    const base = live ?? this.emptySnapshot(site);
    const previous = base.pages.find((p) => p.id === page.id);
    const entry = this.snapshotPage(
      page,
      blocks,
      previous && previous.version === page.version
        ? new Date(previous.publishedAt)
        : now,
    );
    const pages = [...base.pages.filter((p) => p.id !== page.id), entry];
    const deployment = await this.deploy(
      businessId,
      actorUserId,
      { ...base, pages },
      `Published ${page.kind} "${page.title}" (v${page.version})`,
      WebsiteDeploymentKind.publish,
      null,
      async (tx) => {
        await tx.websitePage.update({
          where: { id: page.id },
          data: {
            status: WebsitePageStatus.published,
            publishedVersion: page.version,
            publishedAt: page.publishedAt ?? now,
            publishAt: null,
          },
        });
      },
    );
    return {
      deployment: this.deploymentSummary(deployment),
      path: pagePath(page.kind, page.slug, base.settings.homePageId, page.id),
    };
  }

  async unpublishPage(businessId: string, actorUserId: string, pageId: string) {
    const site = await this.site(businessId);
    const page = await this.db.websitePage.findFirst({
      where: { id: pageId, siteId: site.id },
    });
    if (!page) notFound('Page');
    const live = await this.liveSnapshot(site);
    if (!live || !live.pages.some((p) => p.id === page.id)) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'This page is not live.',
        HttpStatus.CONFLICT,
      );
    }
    const blockedBy: string[] = [];
    if (navPageIds(live.navigation).includes(page.id))
      blockedBy.push(
        'a live menu links to it (remove it in Navigation and publish)',
      );
    if (
      [
        live.settings.homePageId,
        live.settings.notFoundPageId,
        live.settings.privacyPageId,
      ].includes(page.id)
    ) {
      blockedBy.push(
        'Website Settings use it as the home, not-found or privacy page',
      );
    }
    if (blockedBy.length) {
      throw new AppException(
        WEBSITE_ERRORS.PUBLISH_BLOCKED,
        `Can't unpublish: ${blockedBy.join('; ')}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const deployment = await this.deploy(
      businessId,
      actorUserId,
      { ...live, pages: live.pages.filter((p) => p.id !== page.id) },
      `Unpublished ${page.kind} "${page.title}"`,
      WebsiteDeploymentKind.publish,
      null,
      async (tx) => {
        await tx.websitePage.update({
          where: { id: page.id },
          data: { status: WebsitePageStatus.unpublished },
        });
      },
    );
    return { deployment: this.deploymentSummary(deployment) };
  }

  /** Scheduled publishing tick: publishes every page whose time has come, across businesses. */
  async publishDueScheduled(now = new Date()) {
    const due = await this.prisma.websitePage.findMany({
      where: { status: WebsitePageStatus.scheduled, publishAt: { lte: now } },
      orderBy: [{ publishAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, businessId: true },
    });
    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    for (const page of due) {
      try {
        await this.cls.run(async () => {
          this.cls.set(CLS_KEY_BUSINESS_ID, page.businessId);
          await this.publishPage(page.businessId, null, page.id);
        });
        results.push({ pageId: page.id, ok: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Publish failed';
        await this.prisma.websitePage.update({
          where: { id: page.id },
          data: { status: WebsitePageStatus.draft, publishAt: null },
        });
        await this.prisma.auditLog.create({
          data: {
            businessId: page.businessId,
            action: 'website.scheduled_publish.failed',
            entity: 'website_page',
            entityId: page.id,
            after: { error: message.slice(0, 300) },
          },
        });
        results.push({ pageId: page.id, ok: false, error: message });
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------------------------
  // Deployments

  emptySnapshot(site: WebsiteSite): WebsiteSnapshot {
    return {
      pages: [],
      navigation: { header: [], footer: [] },
      theme: this.draftTheme(site),
      settings: readSettings(site.settings),
    };
  }

  /** Every published artifact must be self-consistent: menus and settings only point at live pages. */
  private assertSnapshotConsistent(snapshot: WebsiteSnapshot) {
    const live = new Map(snapshot.pages.map((p) => [p.id, p]));
    const problems: string[] = [];
    const all = [
      ...snapshot.navigation.header,
      ...snapshot.navigation.footer,
    ].flatMap((i) => [i, ...(i.children ?? [])]);
    for (const item of all) {
      if (item.type === 'page' && (!item.pageId || !live.has(item.pageId))) {
        problems.push(
          `Menu item "${item.label}" points to a page that isn't published.`,
        );
      }
    }
    const { homePageId, notFoundPageId, privacyPageId } = snapshot.settings;
    for (const [label, id] of [
      ['Home page', homePageId],
      ['Not-found page', notFoundPageId],
      ['Privacy page', privacyPageId],
    ] as const) {
      if (id && (!live.has(id) || live.get(id)!.kind !== WebsitePageKind.page))
        problems.push(
          `${label} setting points to a page that isn't a published standard page.`,
        );
    }
    if (problems.length) {
      throw new AppException(
        WEBSITE_ERRORS.PUBLISH_BLOCKED,
        problems.join(' '),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async deploy(
    businessId: string,
    actorUserId: string | null,
    snapshot: WebsiteSnapshot,
    summary: string,
    kind: WebsiteDeploymentKind,
    restoredFrom: number | null,
    extra?: (tx: TenantTx) => Promise<void>,
  ) {
    this.assertSnapshotConsistent(snapshot);
    const site = await this.site(businessId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          const last = await tx.websiteDeployment.findFirst({
            where: { siteId: site.id },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const deployment = await tx.websiteDeployment.create({
            data: {
              businessId,
              siteId: site.id,
              number: (last?.number ?? 0) + 1,
              kind,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              summary: summary.slice(0, 300),
              actorUserId,
              restoredFrom,
            },
          });
          await tx.websiteSite.update({
            where: { id: site.id },
            data: { liveDeploymentId: deployment.id },
          });
          if (extra) await extra(tx);
          await this.audit(
            tx,
            businessId,
            actorUserId,
            kind === WebsiteDeploymentKind.rollback
              ? 'website.deployment.rolled_back'
              : 'website.deployment.published',
            deployment.id,
            null,
            { number: deployment.number, summary: deployment.summary },
          );
          return deployment;
        });
      } catch (error) {
        // Two publishes at once can race for the same deployment number; retry with the next one.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }
    throw new AppException(
      WEBSITE_ERRORS.CONFLICT,
      'Another publish is in progress. Try again.',
      HttpStatus.CONFLICT,
    );
  }

  deploymentSummary(d: {
    id: string;
    number: number;
    kind: WebsiteDeploymentKind;
    summary: string;
    actorUserId: string | null;
    restoredFrom: number | null;
    createdAt: Date;
    snapshot?: unknown;
  }) {
    const snap = d.snapshot as WebsiteSnapshot | undefined;
    return {
      id: d.id,
      number: d.number,
      kind: d.kind,
      summary: d.summary,
      actorUserId: d.actorUserId,
      restoredFrom: d.restoredFrom,
      createdAt: d.createdAt,
      pageCount: snap?.pages?.length,
    };
  }

  /** What differs between the editable drafts and the live artifact (site-level only). */
  async pendingChanges(businessId: string) {
    const site = await this.site(businessId);
    const live = await this.liveSnapshot(site);
    const draft = {
      navigation: this.draftNavigation(site),
      theme: this.draftTheme(site),
      settings: readSettings(site.settings),
    };
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    const pages = await this.db.websitePage.findMany({
      where: { siteId: site.id, status: WebsitePageStatus.published },
      select: {
        id: true,
        title: true,
        kind: true,
        version: true,
        publishedVersion: true,
      },
    });
    return {
      hasLive: !!live,
      navigation: !live || !same(live.navigation, draft.navigation),
      theme: !live || !same(live.theme, draft.theme),
      settings: !live || !same(live.settings, draft.settings),
      pagesWithUnpublishedEdits: pages
        .filter((p) => p.publishedVersion !== p.version)
        .map((p) => ({ id: p.id, title: p.title, kind: p.kind })),
    };
  }

  /** Publishes the draft navigation, theme and settings (pages keep their live versions). */
  async publishSite(
    businessId: string,
    actorUserId: string,
    parts: { navigation?: boolean; theme?: boolean; settings?: boolean } = {
      navigation: true,
      theme: true,
      settings: true,
    },
  ) {
    const site = await this.site(businessId);
    const live = (await this.liveSnapshot(site)) ?? this.emptySnapshot(site);
    const next: WebsiteSnapshot = {
      pages: live.pages,
      navigation: parts.navigation
        ? this.draftNavigation(site)
        : live.navigation,
      theme: parts.theme ? this.draftTheme(site) : live.theme,
      settings: parts.settings ? readSettings(site.settings) : live.settings,
    };
    const changed = (['navigation', 'theme', 'settings'] as const).filter(
      (k) => parts[k],
    );
    const deployment = await this.deploy(
      businessId,
      actorUserId,
      next,
      `Published ${changed.join(', ')}`,
      WebsiteDeploymentKind.publish,
      null,
    );
    return this.deploymentSummary(deployment);
  }

  async listDeployments(businessId: string) {
    const site = await this.site(businessId);
    const rows = await this.db.websiteDeployment.findMany({
      where: { siteId: site.id },
      orderBy: { number: 'desc' },
      take: 50,
    });
    const actors = await this.authorNames(
      businessId,
      rows.map((r) => r.actorUserId),
    );
    return rows.map((r) => ({
      ...this.deploymentSummary(r),
      actorName: r.actorUserId ? (actors.get(r.actorUserId) ?? null) : null,
      live: r.id === site.liveDeploymentId,
    }));
  }

  /** Points the site at an earlier artifact. Business data (orders, products, customers) is untouched. */
  async rollback(
    businessId: string,
    actorUserId: string,
    deploymentId: string,
  ) {
    const site = await this.site(businessId);
    const target = await this.db.websiteDeployment.findFirst({
      where: { id: deploymentId, siteId: site.id },
    });
    if (!target) notFound('Deployment');
    if (target.id === site.liveDeploymentId) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'That version is already live.',
        HttpStatus.CONFLICT,
      );
    }
    const snapshot = target.snapshot as unknown as WebsiteSnapshot;
    // Pages deleted since then can't be brought back; drop them (and menu links to them).
    const existing = await this.db.websitePage.findMany({
      where: { siteId: site.id },
      select: { id: true },
    });
    const ids = new Set(existing.map((p) => p.id));
    const pages = snapshot.pages.filter((p) => ids.has(p.id));
    const keep = (items: WebsiteNavigation['header']) =>
      items
        .filter((i) => i.type !== 'page' || (i.pageId && ids.has(i.pageId)))
        .map((i) => ({
          ...i,
          children: i.children?.filter(
            (c) => c.type !== 'page' || (c.pageId && ids.has(c.pageId)),
          ),
        }));
    const navigation = {
      header: keep(snapshot.navigation.header),
      footer: keep(snapshot.navigation.footer),
    };
    const settings = { ...snapshot.settings };
    for (const key of [
      'homePageId',
      'notFoundPageId',
      'privacyPageId',
    ] as const) {
      if (settings[key] && !pages.some((p) => p.id === settings[key]))
        settings[key] = '';
    }
    const restored: WebsiteSnapshot = {
      ...snapshot,
      pages,
      navigation,
      settings,
    };
    const dropped = snapshot.pages.length - pages.length;
    const deployment = await this.deploy(
      businessId,
      actorUserId,
      restored,
      `Rolled back to deployment #${target.number}${dropped ? ` (${dropped} deleted page${dropped === 1 ? '' : 's'} left out)` : ''}`,
      WebsiteDeploymentKind.rollback,
      target.number,
      async (tx) => {
        const livePages = new Map(pages.map((p) => [p.id, p]));
        const rows = await tx.websitePage.findMany({
          where: { siteId: site.id },
          select: { id: true, status: true },
        });
        for (const row of rows) {
          const entry = livePages.get(row.id);
          if (entry) {
            await tx.websitePage.update({
              where: { id: row.id },
              data: {
                status: WebsitePageStatus.published,
                publishedVersion: entry.version,
                publishAt: null,
              },
            });
          } else if (row.status === WebsitePageStatus.published) {
            await tx.websitePage.update({
              where: { id: row.id },
              data: { status: WebsitePageStatus.unpublished },
            });
          }
        }
      },
    );
    return this.deploymentSummary(deployment);
  }

  // -------------------------------------------------------------------------------------------
  // Navigation, theme, settings (drafts)

  async getNavigation(businessId: string) {
    const site = await this.site(businessId);
    const live = await this.liveSnapshot(site);
    const pages = await this.db.websitePage.findMany({
      where: { siteId: site.id },
      orderBy: [{ kind: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, slug: true, kind: true, status: true },
    });
    const draft = this.draftNavigation(site);
    const settings = readSettings(site.settings);
    const pageById = new Map(pages.map((p) => [p.id, p]));
    const issues = [...draft.header, ...draft.footer]
      .flatMap((i) => [i, ...(i.children ?? [])])
      .flatMap((item) => {
        if (item.type !== 'page') return [];
        const page = item.pageId ? pageById.get(item.pageId) : undefined;
        if (!page)
          return [
            {
              itemId: item.id,
              label: item.label,
              problem: 'Page no longer exists',
            },
          ];
        if (page.status !== WebsitePageStatus.published)
          return [
            {
              itemId: item.id,
              label: item.label,
              problem: 'Page is not published',
            },
          ];
        return [];
      });
    return {
      draft,
      live: live?.navigation ?? null,
      pages: pages.map((p) => ({
        ...p,
        path: pagePath(p.kind, p.slug, settings.homePageId, p.id),
      })),
      issues,
      changed:
        !live || JSON.stringify(live.navigation) !== JSON.stringify(draft),
    };
  }

  async saveNavigation(
    businessId: string,
    actorUserId: string,
    input: unknown,
  ) {
    const site = await this.site(businessId);
    let nav: WebsiteNavigation;
    try {
      nav = normalizeNavigation(input);
    } catch (error) {
      invalid(error);
    }
    const ids = navPageIds(nav);
    if (ids.length) {
      const found = await this.db.websitePage.findMany({
        where: { siteId: site.id, id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== new Set(ids).size) {
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          'A menu item points to a page that does not exist.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const before = this.draftNavigation(site);
    await this.db.websiteSite.update({
      where: { id: site.id },
      data: { draftNavigation: nav as unknown as Prisma.InputJsonValue },
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      'website.navigation.changed',
      site.id,
      before,
      nav,
    );
    return this.getNavigation(businessId);
  }

  async getTheme(businessId: string) {
    const site = await this.site(businessId);
    const live = await this.liveSnapshot(site);
    const draft = this.draftTheme(site);
    return {
      draft,
      live: live?.theme ?? null,
      contrast: themeContrastChecks(draft),
      changed: !live || JSON.stringify(live.theme) !== JSON.stringify(draft),
    };
  }

  async saveTheme(businessId: string, actorUserId: string, input: unknown) {
    const site = await this.site(businessId);
    let theme: WebsiteTheme;
    try {
      theme = normalizeTheme(input);
    } catch (error) {
      invalid(error);
    }
    const before = this.draftTheme(site);
    await this.db.websiteSite.update({
      where: { id: site.id },
      data: { draftTheme: theme as unknown as Prisma.InputJsonValue },
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      'website.theme.changed',
      site.id,
      before,
      theme,
    );
    return this.getTheme(businessId);
  }

  async getSettings(businessId: string) {
    const site = await this.site(businessId);
    const live = await this.liveSnapshot(site);
    const business = await this.businessSummary(businessId);
    const pages = await this.db.websitePage.findMany({
      where: { siteId: site.id, kind: WebsitePageKind.page },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, status: true },
    });
    return {
      settings: readSettings(site.settings),
      live: live?.settings ?? null,
      maintenanceMode: site.maintenanceMode,
      business: {
        name: business.name,
        slug: business.slug,
        locale: business.locale,
        timezone: business.timezone,
        currency: business.currency,
      },
      pages,
      changed:
        !live ||
        JSON.stringify(live.settings) !==
          JSON.stringify(readSettings(site.settings)),
    };
  }

  async saveSettings(businessId: string, actorUserId: string, input: unknown) {
    const site = await this.site(businessId);
    const current = readSettings(site.settings);
    let next: WebsiteSettings;
    try {
      next = normalizeSettings(input, current);
    } catch (error) {
      invalid(error);
    }
    const pageIds = [
      next.homePageId,
      next.notFoundPageId,
      next.privacyPageId,
    ].filter(Boolean);
    if (pageIds.length) {
      const found = await this.db.websitePage.findMany({
        where: {
          siteId: site.id,
          id: { in: pageIds },
          kind: WebsitePageKind.page,
        },
        select: { id: true },
      });
      if (found.length !== new Set(pageIds).size) {
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          'Home, not-found and privacy settings must point to existing standard pages.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const storefront = (site.settings as Record<string, unknown> | null)
      ?.storefront;
    await this.db.websiteSite.update({
      where: { id: site.id },
      data: {
        settings: {
          ...next,
          ...(storefront ? { storefront } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      'website.settings.changed',
      site.id,
      current,
      next,
    );
    return this.getSettings(businessId);
  }

  /** Maintenance mode takes effect immediately (it is an operational switch, not a draft). */
  async setMaintenance(
    businessId: string,
    actorUserId: string,
    enabled: boolean,
  ) {
    const site = await this.site(businessId);
    await this.db.websiteSite.update({
      where: { id: site.id },
      data: { maintenanceMode: enabled },
    });
    await this.audit(
      this.db,
      businessId,
      actorUserId,
      'website.maintenance.changed',
      site.id,
      { maintenanceMode: site.maintenanceMode },
      { maintenanceMode: enabled },
    );
    return { maintenanceMode: enabled };
  }

  // -------------------------------------------------------------------------------------------

  async audit(
    tx: {
      auditLog: {
        create(args: {
          data: Prisma.AuditLogUncheckedCreateInput;
        }): Promise<unknown>;
      };
    },
    businessId: string,
    actorUserId: string | null,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        businessId,
        actorUserId,
        action,
        entity: action.split('.').slice(0, 2).join('_'),
        entityId,
        before: before === null ? Prisma.JsonNull : before,
        after: after === null ? Prisma.JsonNull : after,
      },
    });
  }
}
