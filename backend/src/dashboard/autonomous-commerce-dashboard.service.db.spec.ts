import { ClsService } from 'nestjs-cls';
import {
  CommerceSupplierClaimSettlementType,
  CommerceSupplierClaimStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutonomousCommerceDashboardService } from './autonomous-commerce-dashboard.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AutonomousCommerceDashboardService (MySQL)', () => {
  let prisma: PrismaService;
  let service: AutonomousCommerceDashboardService;
  let businessId: string;
  let supplierId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Commerce dashboard claim test',
        slug: `commerce-dashboard-${Date.now()}`,
      },
    });
    businessId = business.id;
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new AutonomousCommerceDashboardService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Dashboard claim test supplier' },
    });
    supplierId = supplier.id;
  });

  afterEach(async () => {
    await prisma.commerceSupplierClaim.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('aggregates only open canonical claims and real settlements', async () => {
    const submittedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.commerceSupplierClaim.create({
      data: {
        businessId,
        supplierId,
        reasonCode: 'damage',
        reason: 'Recorded damage from a receiving inspection.',
        currency: 'USD',
        status: CommerceSupplierClaimStatus.partially_settled,
        submittedAt,
        items: {
          create: {
            description: 'Damaged product',
            quantityAffected: 1,
            productLossAmount: 100,
            freightLossAmount: 10,
            otherLossAmount: 5,
          },
        },
        settlements: {
          create: {
            settlementType: CommerceSupplierClaimSettlementType.credit,
            amount: 20,
            currency: 'USD',
            settledAt: new Date(),
          },
        },
      },
    });
    await prisma.commerceSupplierClaim.create({
      data: {
        businessId,
        supplierId,
        reasonCode: 'shortage',
        reason: 'Recorded shortage from an incoming order.',
        currency: 'USD',
        status: CommerceSupplierClaimStatus.submitted,
        submittedAt: new Date(),
        items: {
          create: {
            description: 'Missing units',
            quantityAffected: 2,
            productLossAmount: 40,
          },
        },
      },
    });
    await prisma.commerceSupplierClaim.create({
      data: {
        businessId,
        supplierId,
        reasonCode: 'draft_only',
        reason: 'An unsubmitted draft should not be counted as recoverable.',
        currency: 'USD',
        status: CommerceSupplierClaimStatus.draft,
        items: {
          create: {
            description: 'Draft loss',
            quantityAffected: 1,
            productLossAmount: 999,
          },
        },
      },
    });

    const result = await service.summary(businessId);

    expect(result.supplierClaims).toMatchObject({
      status: 'available',
      openClaims: 2,
      recoverableValue: 135,
      agingClaims: 1,
      recoveredThisMonth: 20,
    });
  });
});
