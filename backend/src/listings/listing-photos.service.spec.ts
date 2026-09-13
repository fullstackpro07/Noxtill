import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ListingPhotosService } from './listing-photos.service';
import { AppException } from '../common/filters/app.exception';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ListingPhotosService (UPD-BE-124)', () => {
  let prisma: PrismaService;
  let service: ListingPhotosService;
  let businessId: string;
  const pushPhoto = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );

    const integrations = {
      getTokens: jest.fn().mockResolvedValue({ accessToken: 'fake-token' }),
    };
    const connectors = {
      photoPushProviders: () => [IntegrationProvider.gmb],
      get: () => ({ pushPhoto }),
    };

    service = new ListingPhotosService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Listing Photos Test Biz',
        slug: `listing-photos-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    pushPhoto.mockReset();
  });

  afterAll(async () => {
    await prisma.listingPhoto.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('create() and list() really persist a photo scoped to this business', async () => {
    const photo = await service.create(businessId, {
      url: 'https://cdn.example/exterior-1.jpg',
      category: 'exterior',
    });
    expect(photo.category).toBe('exterior');
    expect(photo.pushedProviders).toEqual([]);

    const list = await service.list(businessId);
    expect(list.some((p) => p.id === photo.id)).toBe(true);
  });

  it('update() really changes the category', async () => {
    const photo = await service.create(businessId, {
      url: 'https://cdn.example/misc.jpg',
      category: 'team',
    });
    const updated = await service.update(businessId, photo.id, {
      category: 'products',
    });
    expect(updated.category).toBe('products');
  });

  it('update()/remove() 404 on a photo from another business', async () => {
    const otherBusiness = await prisma.business.create({
      data: { name: 'Other Biz', slug: `listing-photos-other-${Date.now()}` },
    });
    const otherPhoto = await prisma.listingPhoto.create({
      data: {
        businessId: otherBusiness.id,
        url: 'https://cdn.example/other.jpg',
        category: 'logo',
      },
    });

    await expect(
      service.update(businessId, otherPhoto.id, { category: 'exterior' }),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.remove(businessId, otherPhoto.id),
    ).rejects.toBeInstanceOf(AppException);

    await prisma.listingPhoto.delete({ where: { id: otherPhoto.id } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: otherBusiness.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
  });

  it('remove() really deletes the row', async () => {
    const photo = await service.create(businessId, {
      url: 'https://cdn.example/to-delete.jpg',
      category: 'interior',
    });
    await service.remove(businessId, photo.id);
    const list = await service.list(businessId);
    expect(list.some((p) => p.id === photo.id)).toBe(false);
  });

  it('push() skips a provider with no connected Integration row', async () => {
    const photo = await service.create(businessId, {
      url: 'https://cdn.example/no-integration.jpg',
      category: 'products',
    });
    const results = await service.push(businessId, photo.id);
    expect(results).toEqual([]);
    expect(pushPhoto).not.toHaveBeenCalled();
  });

  it('push() calls the real connector for a connected provider and records success in pushedProviders', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
      },
    });
    pushPhoto.mockResolvedValue({ ok: true });

    const photo = await service.create(businessId, {
      url: 'https://cdn.example/pushable.jpg',
      category: 'exterior',
    });
    const results = await service.push(businessId, photo.id);
    expect(results).toEqual([
      { provider: IntegrationProvider.gmb, status: 'success' },
    ]);
    expect(pushPhoto).toHaveBeenCalledWith(
      { accessToken: 'fake-token' },
      photo.url,
      'exterior',
      expect.anything(),
    );

    const refetched = await prisma.listingPhoto.findUniqueOrThrow({
      where: { id: photo.id },
    });
    expect(refetched.pushedProviders).toEqual([IntegrationProvider.gmb]);
  });

  it('push() records a real per-provider failure without throwing', async () => {
    pushPhoto.mockRejectedValue(new Error('GMB media API unreachable'));

    const photo = await service.create(businessId, {
      url: 'https://cdn.example/fails.jpg',
      category: 'exterior',
    });
    const results = await service.push(businessId, photo.id);
    expect(results).toEqual([
      {
        provider: IntegrationProvider.gmb,
        status: 'failed',
        message: 'GMB media API unreachable',
      },
    ]);
  });

  it('push() with an explicit providers list only attempts real intersection with connectable providers', async () => {
    pushPhoto.mockResolvedValue({ ok: true });
    const photo = await service.create(businessId, {
      url: 'https://cdn.example/selective.jpg',
      category: 'logo',
    });
    const results = await service.push(businessId, photo.id, [
      IntegrationProvider.yelp,
    ]);
    expect(results).toEqual([]);
    expect(pushPhoto).not.toHaveBeenCalled();
  });
});
