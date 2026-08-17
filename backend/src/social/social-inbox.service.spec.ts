import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SocialInboxService } from './social-inbox.service';
import { AppException } from '../common/filters/app.exception';
import type { SocialAccountsService } from './social-accounts.service';
import type { SocialConnectorRegistry } from './connectors/social-connector-registry';
import {
  SocialAccountStatus,
  SocialInboxStatus,
  SocialPlatform,
} from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SocialInboxService (UPD-BE-049)', () => {
  let prisma: PrismaService;
  let service: SocialInboxService;
  let businessId: string;

  const replyToInboxItem = jest.fn();
  const accounts = { getTokens: jest.fn() };
  const connectors = { get: jest.fn().mockReturnValue({ replyToInboxItem }) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SocialInboxService(
      tenantPrisma,
      prisma,
      accounts as unknown as SocialAccountsService,
      connectors as unknown as SocialConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Social Inbox Test Biz',
        slug: `social-inbox-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.socialAccount.create({
      data: {
        businessId,
        platform: SocialPlatform.facebook,
        status: SocialAccountStatus.connected,
        externalAccountId: 'page-123',
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.socialInboxItem.deleteMany({ where: { businessId } });
    await prisma.socialAccount.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('ingest() resolves the owning business via externalAccountId and creates a real row', async () => {
    await service.ingest(SocialPlatform.facebook, 'page-123', {
      externalId: 'comment-1',
      kind: 'comment',
      authorName: 'Alice',
      text: 'Do you deliver?',
      receivedAt: new Date().toISOString(),
    });

    const rows = await service.list(businessId);
    expect(
      rows.some(
        (r) => r.externalId === 'comment-1' && r.text === 'Do you deliver?',
      ),
    ).toBe(true);
  });

  it('ingest() is idempotent — re-ingesting the same externalId never duplicates', async () => {
    await service.ingest(SocialPlatform.facebook, 'page-123', {
      externalId: 'comment-1',
      kind: 'comment',
      text: 'Do you deliver? (retry delivery)',
      receivedAt: new Date().toISOString(),
    });
    const rows = await prisma.socialInboxItem.findMany({
      where: { businessId, externalId: 'comment-1' },
    });
    expect(rows).toHaveLength(1);
  });

  it('ingest() silently no-ops for an externalAccountId no connected business owns', async () => {
    await service.ingest(SocialPlatform.facebook, 'unknown-page-999', {
      externalId: 'comment-orphan',
      kind: 'comment',
      text: 'Nobody should get this',
      receivedAt: new Date().toISOString(),
    });
    const row = await prisma.socialInboxItem.findFirst({
      where: { externalId: 'comment-orphan' },
    });
    expect(row).toBeNull();
  });

  it('reply() calls the real connector with the item + post context, then marks replied', async () => {
    const item = await prisma.socialInboxItem.findFirstOrThrow({
      where: { businessId, externalId: 'comment-1' },
    });
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    replyToInboxItem.mockResolvedValue(undefined);

    const updated = await service.reply(businessId, item.id, 'Yes, citywide!');
    expect(updated.status).toBe(SocialInboxStatus.replied);
    expect(updated.repliedText).toBe('Yes, citywide!');
    expect(updated.repliedAt).not.toBeNull();
    expect(replyToInboxItem).toHaveBeenCalledWith(
      { accessToken: 'tok' },
      { externalId: 'comment-1', postExternalId: undefined },
      'Yes, citywide!',
    );
  });

  it('reply() rejects when the platform is not connected for this business', async () => {
    const item = await prisma.socialInboxItem.create({
      data: {
        businessId,
        platform: SocialPlatform.facebook,
        externalId: 'comment-2',
        kind: 'comment',
        text: 'Another question',
        receivedAt: new Date(),
      },
    });
    accounts.getTokens.mockResolvedValue(null);

    await expect(
      service.reply(businessId, item.id, 'reply text'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('markRead() rejects an id belonging to a different business', async () => {
    const otherBusiness = await prisma.business.create({
      data: { name: 'Other Biz', slug: `other-biz-inbox-${Date.now()}` },
    });
    const otherItem = await prisma.socialInboxItem.create({
      data: {
        businessId: otherBusiness.id,
        platform: SocialPlatform.facebook,
        externalId: 'other-comment',
        kind: 'comment',
        text: 'x',
        receivedAt: new Date(),
      },
    });

    await expect(service.markRead(businessId, otherItem.id)).rejects.toThrow();

    await prisma.socialInboxItem.delete({ where: { id: otherItem.id } });
    await prisma.business.delete({ where: { id: otherBusiness.id } });
  });
});
