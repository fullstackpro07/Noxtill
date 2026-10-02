import { ClsService } from 'nestjs-cls';
import {
  ActionItemType,
  CommerceExperimentMetric,
  CommerceExperimentStatus,
  CommerceExperimentType,
  CommerceListingDraftStatus,
  CommerceRiskRuleKey,
  CommerceRiskSeverity,
  Role,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActionCenterService } from './action-center.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ActionCenterService — Autonomous Commerce items (MySQL)', () => {
  let prisma: PrismaService;
  let service: ActionCenterService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new ActionCenterService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'AC Commerce', slug: `ac-commerce-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const product = await prisma.product.create({
      data: { businessId, name: 'Lamp', stockQty: 50 },
    });
    await prisma.commerceListingDraft.create({
      data: {
        businessId,
        productId: product.id,
        channel: 'shopify',
        status: CommerceListingDraftStatus.review_required,
      },
    });
    await prisma.commerceListingDraft.create({
      data: {
        businessId,
        productId: product.id,
        channel: 'etsy',
        status: CommerceListingDraftStatus.approved,
      },
    });
    await prisma.commerceExperiment.create({
      data: {
        businessId,
        productId: product.id,
        name: 'Lamp price',
        type: CommerceExperimentType.price,
        hypothesis: 'h',
        changeDescription: 'c',
        primaryMetric: CommerceExperimentMetric.units,
        status: CommerceExperimentStatus.stopped,
        stoppedAt: new Date(),
      },
    });
    await prisma.commerceRiskCase.create({
      data: {
        businessId,
        ruleKey: CommerceRiskRuleKey.repeat_returns,
        dedupeKey: `repeat_returns:customer:${stamp}`,
        entityType: 'customer',
        entityId: 'c1',
        entityLabel: 'Pat Returner',
        severity: CommerceRiskSeverity.high,
        signalCount: 5,
        evidence: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.actionItemState.deleteMany({ where: { businessId } });
    await prisma.commerceRiskCase.deleteMany({ where: { businessId } });
    await prisma.commerceExperiment.deleteMany({ where: { businessId } });
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const commerceItems = async () =>
    (await service.list(businessId, Role.owner, null, {})).items.filter(
      (item) => item.type === ActionItemType.commerce,
    );

  it('lists commerce work waiting on a person, from the commerce records', async () => {
    const items = await commerceItems();
    expect(items.map((item) => item.title).sort()).toEqual([
      'Approve listing: Lamp',
      'Decide experiment: Lamp price',
      'High-risk case: Pat Returner',
    ]);
    const risk = items.find((item) => item.title.startsWith('High-risk'))!;
    expect(risk).toMatchObject({
      priority: 'urgent',
      deepLink: '/autonomous-commerce/risk-compliance',
    });
    expect(risk.id.startsWith('commerce:risk_case:')).toBe(true);
  });

  it('can be dismissed like any other item and hides when the module is off', async () => {
    const [first] = await commerceItems();
    await service.dismiss(businessId, first.id);
    expect((await commerceItems()).map((item) => item.id)).not.toContain(
      first.id,
    );
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: ['autonomous-commerce'] },
    });
    expect(await commerceItems()).toEqual([]);
  });
});
