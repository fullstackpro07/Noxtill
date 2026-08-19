import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SeoHeatmapService } from './seo-heatmap.service';
import type { MasterListingService } from '../listings/master-listing.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoHeatmapService (UPD-BE-080)', () => {
  let prisma: PrismaService;
  let service: SeoHeatmapService;
  let businessId: string;
  const findListing = jest.fn();
  let getSpy: jest.SpiedFunction<typeof axios.get>;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const masterListing = {
      find: findListing,
    } as unknown as MasterListingService;
    service = new SeoHeatmapService(
      tenantPrisma,
      masterListing,
      new ConfigService({
        MAPS_PROVIDER_API_KEY: 'maps-key',
        SERPAPI_KEY: 'serp-key',
      }),
    );

    const business = await prisma.business.create({
      data: {
        name: 'Real Pizza Place',
        slug: `seo-heatmap-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    findListing.mockReset();
    getSpy?.mockRestore();
  });

  afterAll(async () => {
    await prisma.seoHeatmapPoint.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('throws a clear error when the Master Business Record has no address to geocode', async () => {
    findListing.mockResolvedValue(null);
    await expect(service.scan(businessId, 'pizza near me')).rejects.toThrow();
  });

  it('scans a real 9-point grid, persists every point, and honestly reports "not found" as a null rank', async () => {
    findListing.mockResolvedValue({
      addressLine1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
    });

    getSpy = jest
      .spyOn(axios, 'get')
      .mockImplementation(
        (url: string, config?: { params?: { ll?: string } }) => {
          if (url.includes('geocode/json')) {
            return Promise.resolve({
              data: {
                status: 'OK',
                results: [
                  { geometry: { location: { lat: 39.78, lng: -89.65 } } },
                ],
              },
            });
          }
          if (url.includes('serpapi.com/search')) {
            const ll = config?.params?.ll ?? '';
            // Business is found (position 3) only at the exact center point.
            if (ll.startsWith('@39.78,-89.65')) {
              return Promise.resolve({
                data: {
                  local_results: {
                    places: [{ position: 3, title: 'Real Pizza Place' }],
                  },
                },
              });
            }
            return Promise.resolve({
              data: {
                local_results: {
                  places: [
                    { position: 1, title: 'A Totally Different Pizzeria' },
                  ],
                },
              },
            });
          }
          return Promise.reject(new Error(`unexpected URL in test: ${url}`));
        },
      );

    const result = await service.scan(businessId, 'pizza near me');
    expect(result.points).toHaveLength(9); // center + 8 ring points

    const centerPoint = result.points.find(
      (p) => p.lat === 39.78 && p.lng === -89.65,
    );
    expect(centerPoint?.rank).toBe(3);
    const ringPoint = result.points.find(
      (p) => p.lat !== 39.78 || p.lng !== -89.65,
    );
    expect(ringPoint?.rank).toBeNull(); // honestly not found, never fabricated

    const stored = await prisma.seoHeatmapPoint.findMany({
      where: { businessId, scanId: result.scanId },
    });
    expect(stored).toHaveLength(9);
  });

  it('list() returns the most recent real scan for a keyword', async () => {
    const result = await service.list(businessId, 'pizza near me');
    expect(result.points.length).toBe(9);
    expect(result.points.every((p) => p.keyword === 'pizza near me')).toBe(
      true,
    );
  });

  it('list() returns an empty real result for a keyword never scanned', async () => {
    const result = await service.list(businessId, 'never scanned keyword');
    expect(result.scanId).toBeNull();
    expect(result.points).toHaveLength(0);
  });
});
