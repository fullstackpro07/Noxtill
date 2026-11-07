import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import {
  ProductKind,
  WebsitePageKind,
  WebsitePageStatus,
} from '@prisma/client';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { ActivityService } from '../activity/activity.service';
import type { S3Service } from '../common/storage/s3.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicOrderingService } from '../public-ordering/public-ordering.service';
import { WebsiteBuilderService } from './website-builder.service';
import {
  contrastRatio,
  themeContrastChecks,
  normalizeTheme,
} from './website-content.util';
import { WebsiteDomainsService } from './website-domains.service';
import { WebsiteFormsService } from './website-forms.service';
import { WebsiteOverviewService } from './website-overview.service';
import { WebsitePublicService } from './website-public.service';
import { WebsiteStorefrontService } from './website-storefront.service';
import { WebsiteService } from './website.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  run<T>(fn: () => T): T {
    return fn();
  }
}

describe('Website & Commerce (MySQL)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let website: WebsiteService;
  let forms: WebsiteFormsService;
  let domains: WebsiteDomainsService;
  let storefront: WebsiteStorefrontService;
  let builder: WebsiteBuilderService;
  let publicSite: WebsitePublicService;
  let overview: WebsiteOverviewService;
  let ordering: PublicOrderingService;
  const createMessage = jest.fn();
  const stamp = Date.now();
  let businessId: string;
  let otherBusinessId: string;
  let slug: string;
  let userId: string;
  let productId: string;
  let hiddenProductId: string;

  const as = (id: string) => cls.set(CLS_KEY_BUSINESS_ID, id);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    website = new WebsiteService(tenant, prisma, cls as unknown as ClsService);
    forms = new WebsiteFormsService(tenant, prisma, website);
    domains = new WebsiteDomainsService(tenant, website, {
      get: () => 'https://app.test',
    } as unknown as ConfigService);
    storefront = new WebsiteStorefrontService(tenant, prisma, website);
    builder = new WebsiteBuilderService(tenant, prisma, website, forms, {
      createMessage,
    } as unknown as AiInfraService);
    publicSite = new WebsitePublicService(prisma, forms, {
      getSignedDownloadUrl: jest.fn(),
    } as unknown as S3Service);
    overview = new WebsiteOverviewService(tenant, website);
    ordering = new PublicOrderingService(prisma, {
      record: jest.fn(),
    } as unknown as ActivityService);

    slug = `web-${stamp}`;
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Web Co',
          slug,
          phone: '+14155550101',
          address: '1 Main St',
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other Web Co', slug: `web-other-${stamp}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `web-${stamp}@test.local`,
          name: 'Web Owner',
          passwordHash: 'x',
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Blue Mug',
          sellingPrice: 12,
          stockQty: 5,
          kind: ProductKind.product,
        },
      })
    ).id;
    hiddenProductId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Secret Mug',
          sellingPrice: 30,
          stockQty: 5,
          kind: ProductKind.product,
        },
      })
    ).id;
    as(businessId);
  });

  afterAll(async () => {
    const ids = [businessId, otherBusinessId];
    await prisma.websiteFormSubmission.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteForm.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.websitePageVersion.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteSite.updateMany({
      where: { businessId: { in: ids } },
      data: { liveDeploymentId: null },
    });
    await prisma.websiteDeployment.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websitePage.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.websiteDomain.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteRedirect.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteProductSetting.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteCollection.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.websiteSite.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.orderItem.deleteMany({
      where: { order: { businessId: { in: ids } } },
    });
    await prisma.order.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('versions pages, publishes immutable deployments, serves only the live copy and rolls back', async () => {
    as(businessId);
    const home = await website.createPage(
      businessId,
      userId,
      WebsitePageKind.page,
      {
        title: 'Home',
        blocks: [
          {
            type: 'hero',
            heading: 'Welcome',
            ctaLabel: 'Shop',
            ctaHref: '/shop',
          },
          { type: 'products', heading: 'Picks', source: 'all', limit: 6 },
          { type: 'contact', heading: 'Find us' },
        ],
      },
    );
    // Unsafe links are rejected, not stored.
    await expect(
      website.updatePage(businessId, userId, home.id, {
        blocks: [
          {
            type: 'cta',
            heading: 'x',
            label: 'Go',
            href: 'javascript:alert(1)',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_INVALID_CONTENT' } });

    expect((await publicSite.render(slug, '/')).state).toBe('not_published');
    const first = await website.publishPage(businessId, userId, home.id);
    expect(first.deployment.number).toBe(1);
    await website.saveSettings(businessId, userId, { homePageId: home.id });
    await website.saveNavigation(businessId, userId, {
      header: [
        { id: 'h', label: 'Home', type: 'page', pageId: home.id },
        { id: 's', label: 'Store', type: 'store' },
      ],
    });
    await website.publishSite(businessId, userId);

    // Editing after publish changes the draft only; visitors still see v1 until it is published.
    await website.updatePage(businessId, userId, home.id, { title: 'Home v2' });
    let rendered = await publicSite.render(slug, '/');
    expect(rendered).toMatchObject({ state: 'ok', view: { title: 'Home' } });
    const view = (
      rendered as { view: { blocks: Array<Record<string, unknown>> } }
    ).view;
    expect(view.blocks.find((b) => b.type === 'products')).toMatchObject({
      products: [
        expect.objectContaining({ name: 'Blue Mug', price: 12 }),
        expect.anything(),
      ],
    });
    expect(view.blocks.find((b) => b.type === 'contact')).toMatchObject({
      contact: { phone: '+14155550101', address: '1 Main St' },
    });
    expect(view.blocks.find((b) => b.type === 'hero')).toMatchObject({
      ctaHref: `/site/${slug}/shop`,
    });
    expect(
      (
        rendered as { navigation: { header: Array<{ href: string }> } }
      ).navigation.header.map((i) => i.href),
    ).toEqual([`/site/${slug}`, `/store/${slug}`]);

    const pending = await website.pendingChanges(businessId);
    expect(pending.pagesWithUnpublishedEdits.map((p) => p.id)).toEqual([
      home.id,
    ]);
    await website.publishPage(businessId, userId, home.id);
    rendered = await publicSite.render(slug, '/');
    expect(rendered).toMatchObject({ view: { title: 'Home v2' } });

    // A page in a live menu can't be unpublished; restoring a version creates a new version.
    await expect(
      website.unpublishPage(businessId, userId, home.id),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_PUBLISH_BLOCKED' } });
    const restored = await website.restoreVersion(
      businessId,
      userId,
      home.id,
      1,
    );
    expect(restored).toMatchObject({ title: 'Home', version: 3 });

    // Rollback to deployment #2 brings back the v1 title and re-syncs page status.
    const deployments = await website.listDeployments(businessId);
    expect(deployments.map((d) => d.number)).toEqual([3, 2, 1]);
    const two = deployments.find((d) => d.number === 2)!;
    const rb = await website.rollback(businessId, userId, two.id);
    expect(rb).toMatchObject({ kind: 'rollback', restoredFrom: 2, number: 4 });
    rendered = await publicSite.render(slug, '/');
    expect(rendered).toMatchObject({ view: { title: 'Home' } });
    const page = await prisma.websitePage.findUniqueOrThrow({
      where: { id: home.id },
    });
    expect(page).toMatchObject({
      status: WebsitePageStatus.published,
      publishedVersion: 1,
    });

    // Another business never sees this site's pages.
    as(otherBusinessId);
    expect(await website.listPages(otherBusinessId)).toEqual([]);
    as(businessId);
  });

  it('blocks a menu that points at an unpublished page and serves redirects, blog, maintenance', async () => {
    as(businessId);
    const draft = await website.createPage(
      businessId,
      userId,
      WebsitePageKind.page,
      {
        title: 'About',
        blocks: [{ type: 'text', heading: 'About', body: 'Hi' }],
      },
    );
    const nav = await website.getNavigation(businessId);
    await website.saveNavigation(businessId, userId, {
      header: [
        ...nav.draft.header,
        { id: 'a', label: 'About', type: 'page', pageId: draft.id },
      ],
    });
    await expect(
      website.publishSite(businessId, userId, { navigation: true }),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_PUBLISH_BLOCKED' } });
    await website.publishPage(businessId, userId, draft.id);
    await website.publishSite(businessId, userId, { navigation: true });

    const post = await website.createPage(
      businessId,
      userId,
      WebsitePageKind.post,
      {
        title: 'Launch news',
        excerpt: 'We opened',
        blocks: [{ type: 'text', body: 'Hello' }],
      },
    );
    await website.publishPage(businessId, userId, post.id);
    expect(await publicSite.render(slug, '/blog')).toMatchObject({
      view: {
        type: 'blog_index',
        posts: [expect.objectContaining({ slug: 'launch-news' })],
      },
    });
    expect(await publicSite.render(slug, '/blog/launch-news')).toMatchObject({
      view: { type: 'post', title: 'Launch news' },
    });
    expect(await publicSite.render(slug, '/nope')).toMatchObject({
      status: 404,
      view: { type: 'not_found' },
    });

    await domains.addRedirect(businessId, userId, {
      fromPath: '/old-about',
      toPath: '/about',
    });
    await expect(
      domains.addRedirect(businessId, userId, {
        fromPath: '/about',
        toPath: '/old-about',
      }),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_INVALID_CONTENT' } });
    expect(await publicSite.render(slug, '/old-about')).toMatchObject({
      state: 'redirect',
      to: `/site/${slug}/about`,
    });

    await website.setMaintenance(businessId, userId, true);
    expect((await publicSite.render(slug, '/')).state).toBe('maintenance');
    await website.setMaintenance(businessId, userId, false);
  });

  it('writes website forms to the canonical CRM customer once, never pre-ticks consent, blocks spam', async () => {
    as(businessId);
    await expect(
      forms.create(businessId, userId, {
        name: 'Bad',
        fields: [{ label: 'Email', type: 'email', mapTo: 'email' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_INVALID_CONTENT' } });
    const form = await forms.create(businessId, userId, {
      name: 'Contact',
      fields: [
        { label: 'Name', type: 'text', required: true, mapTo: 'name' },
        { label: 'Phone', type: 'phone', required: true, mapTo: 'phone' },
        { label: 'Message', type: 'textarea', mapTo: 'notes' },
      ],
      consentText: 'Send me offers',
      customerTag: 'web-lead',
    });
    const test = await forms.test(
      businessId,
      userId,
      form.id,
      { name: 'Tess', phone: '+14155550102' },
      false,
    );
    expect(test).toMatchObject({
      valid: true,
      wouldWrite: { action: 'create_customer' },
    });
    expect(
      await prisma.customer.count({
        where: { businessId, phone: '+14155550102' },
      }),
    ).toBe(0);

    const values = {
      name: 'Ana',
      phone: '+14155550103',
      message: 'Do you deliver?',
    };
    await forms.submit(form.publicToken, { values, idempotencyKey: 'k1' });
    await forms.submit(form.publicToken, { values, idempotencyKey: 'k1' });
    const customers = await prisma.customer.findMany({
      where: { businessId, phone: '+14155550103' },
    });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      name: 'Ana',
      consentMarketing: false,
      tags: ['web-lead'],
    });
    expect(customers[0].notes).toContain('Message: Do you deliver?');

    // Same person, consent ticked this time: the existing customer is updated, not duplicated.
    await forms.submit(form.publicToken, {
      values,
      idempotencyKey: 'k2',
      marketingConsent: true,
    });
    expect(
      await prisma.customer.findMany({
        where: { businessId, phone: '+14155550103' },
      }),
    ).toEqual([expect.objectContaining({ consentMarketing: true })]);

    await forms.submit(form.publicToken, {
      values: { name: 'Bot', phone: '+14155550104' },
      idempotencyKey: 'k3',
      company: 'spam inc',
    });
    expect(
      await prisma.customer.count({
        where: { businessId, phone: '+14155550104' },
      }),
    ).toBe(0);
    const list = await forms.list(businessId);
    expect(list.forms[0].last30Days).toEqual({
      accepted: 2,
      spamBlocked: 1,
      failed: 0,
    });
  });

  it('verifies domains by DNS TXT and only lets verified domains be primary', async () => {
    as(businessId);
    const domain = await domains.add(
      businessId,
      userId,
      `https://shop-${stamp}.example.com/`,
    );
    expect(domain.hostname).toBe(`shop-${stamp}.example.com`);
    await expect(
      domains.setPrimary(businessId, userId, domain.id),
    ).rejects.toMatchObject({ response: { code: 'WEBSITE_CONFLICT' } });
    domains.resolveTxt = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { code: 'ENOTFOUND' }));
    expect(await domains.verify(businessId, userId, domain.id)).toMatchObject({
      status: 'failed',
    });
    domains.resolveTxt = jest
      .fn()
      .mockResolvedValue([[domain.verificationRecord.value]]);
    domains.certCheck = jest.fn().mockResolvedValue({
      validTo: new Date(Date.now() + 86_400_000),
      error: null,
    });
    expect(await domains.verify(businessId, userId, domain.id)).toMatchObject({
      status: 'verified',
      ssl: { status: 'valid' },
    });
    const after = await domains.setPrimary(businessId, userId, domain.id);
    expect(after.domains[0]).toMatchObject({ isPrimary: true });
  });

  it('applies storefront presentation to the real store without touching price or stock', async () => {
    as(businessId);
    await storefront.updateProduct(businessId, userId, productId, {
      webTitle: 'The Blue Mug',
      badge: 'New',
      sortPriority: 5,
    });
    await storefront.updateProduct(businessId, userId, hiddenProductId, {
      visible: false,
    });
    const menu = await ordering.getMenu(slug);
    expect(menu.products.map((p) => p.name)).toEqual(['The Blue Mug']);
    expect(menu.products[0]).toMatchObject({ sellingPrice: 12, badge: 'New' });
    await expect(
      ordering.createOrder(
        slug,
        {
          items: [{ productId: hiddenProductId, qty: 1 }],
          orderType: 'takeaway',
          customerName: 'X',
          customerPhone: '+14155550105',
        },
        'hidden-1',
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'One of these items is no longer available online.',
      },
    });
    await storefront.saveOptions(businessId, userId, {
      checkoutEnabled: false,
    });
    await expect(
      ordering.createOrder(
        slug,
        {
          items: [{ productId, qty: 1 }],
          orderType: 'takeaway',
          customerName: 'X',
          customerPhone: '+14155550105',
        },
        'off-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'PUBLIC_ORDER_CHECKOUT_DISABLED' },
    });
    await storefront.saveOptions(businessId, userId, { checkoutEnabled: true });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product).toMatchObject({ name: 'Blue Mug', stockQty: 5 });
    expect(Number(product.sellingPrice)).toBe(12);
    const sf = await storefront.overview(businessId);
    expect(sf.kpis).toMatchObject({ productsVisible: 1 });
  });

  it('builds draft pages from real data, keeps placeholders when AI fails, and never publishes', async () => {
    as(businessId);
    createMessage.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low',
          },
        },
      },
    });
    const before = (await website.listDeployments(businessId)).length;
    const result = await builder.generate(businessId, userId, {
      goal: 'lead',
      pages: ['about', 'contact'],
      useAi: true,
    });
    expect(result.ai).toMatch(/out of credit/);
    expect(result.pages.map((p) => p.title)).toEqual(['About us', 'Contact']);
    expect(result.pagesNeedingText).toEqual(['About us']);
    expect(result.formCreated).toBeTruthy();
    const pages = await prisma.websitePage.findMany({
      where: { id: { in: result.pages.map((p) => p.id) } },
    });
    expect(
      pages.every((p) => p.status === WebsitePageStatus.draft && p.aiDraft),
    ).toBe(true);
    expect((await website.listDeployments(businessId)).length).toBe(before);
    const status = await builder.status(businessId);
    expect(status.checklist.find((c) => c.key === 'phone')).toMatchObject({
      done: true,
    });
  });

  it('reports overview figures from records and keeps traffic as not tracked', async () => {
    as(businessId);
    const o = await overview.overview(businessId);
    expect(o.siteStatus).toBe('live');
    expect(o.kpis.sessions).toMatchObject({
      value: null,
      availability: 'not_tracked',
    });
    expect(o.kpis.formLeads.value).toBe(2);
    expect(o.kpis.livePages.value).toBe(3);
  });

  it('checks theme contrast with the WCAG formula', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    const bad = themeContrastChecks(
      normalizeTheme({ colors: { text: '#aaaaaa', background: '#ffffff' } }),
    );
    expect(bad.find((c) => c.key === 'body_text')).toMatchObject({
      passes: false,
    });
  });
});
