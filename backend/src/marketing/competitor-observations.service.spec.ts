import { ClsService } from 'nestjs-cls';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { CompetitorObservationsService } from './competitor-observations.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CompetitorObservationsService', () => {
  let prisma: PrismaService;
  let service: CompetitorObservationsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  let competitorId: string;
  let otherCompetitorId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CompetitorObservationsService(tenantPrisma);

    const stamp = Date.now();
    const business = await prisma.business.create({
      data: { name: 'Observations Biz', slug: `obs-test-${stamp}` },
    });
    const other = await prisma.business.create({
      data: { name: 'Observations Other Biz', slug: `obs-test-other-${stamp}` },
    });
    businessId = business.id;
    otherBusinessId = other.id;
    competitorId = (
      await prisma.competitor.create({
        data: { businessId, name: 'Fresh Fades', platformRef: 'ref-1' },
      })
    ).id;
    otherCompetitorId = (
      await prisma.competitor.create({
        data: {
          businessId: otherBusinessId,
          name: 'Elsewhere',
          platformRef: 'ref-2',
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.competitorObservation.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.competitor.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('records a price, keeps history append-only, and lists newest-observed first', async () => {
    const first = await service.create(businessId, {
      competitorId,
      kind: 'price',
      label: 'Express cut',
      amount: 2100,
      observedAt: '2026-08-01T10:00:00.000Z',
    });
    const second = await service.create(businessId, {
      competitorId,
      kind: 'price',
      label: 'Express cut',
      amount: 1900,
      source: 'Their website',
      observedAt: '2026-09-02T10:00:00.000Z',
    });

    expect(first.amount).toBe(2100);
    expect(second.amount).toBe(1900);
    expect(second.source).toBe('Their website');

    const all = await service.list(competitorId);
    expect(all.map((o) => o.id)).toEqual([second.id, first.id]);
  });

  it('allows a service without a price (competitor did not publish one)', async () => {
    const svc = await service.create(businessId, {
      competitorId,
      kind: 'service',
      label: 'Head massage',
    });
    expect(svc.amount).toBeNull();
  });

  it('rejects a price observation with no amount', async () => {
    await expect(
      service.create(businessId, {
        competitorId,
        kind: 'price',
        label: 'Beard trim',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an observation dated in the future', async () => {
    await expect(
      service.create(businessId, {
        competitorId,
        kind: 'offer',
        label: '20% off',
        observedAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('refuses a competitor that belongs to another business', async () => {
    await expect(
      service.create(businessId, {
        competitorId: otherCompetitorId,
        kind: 'service',
        label: 'Sneaky',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never returns another business observations', async () => {
    await prisma.competitorObservation.create({
      data: {
        businessId: otherBusinessId,
        competitorId: otherCompetitorId,
        kind: 'service',
        label: 'Other tenant row',
      },
    });
    const mine = await service.list();
    expect(mine.some((o) => o.label === 'Other tenant row')).toBe(false);
  });

  it('removes an observation and 404s on a second removal', async () => {
    const row = await service.create(businessId, {
      competitorId,
      kind: 'offer',
      label: 'Student discount',
      endsAt: '2026-10-01T00:00:00.000Z',
    });
    expect(row.endsAt).toBe('2026-10-01T00:00:00.000Z');
    await expect(service.remove(row.id)).resolves.toEqual({ success: true });
    await expect(service.remove(row.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
