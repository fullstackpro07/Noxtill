import { ClsService } from 'nestjs-cls';
import { ActionItemType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProcurementService } from '../procurement/procurement.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
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

describe('Action Center — Inventory Agent branch-transfer decisions (MySQL)', () => {
  let prisma: PrismaService;
  let service: ActionCenterService;
  let businessId: string;
  let destinationBusinessId: string;
  let foreignBusinessId: string;
  let sourceProductId: string;
  let destinationProductId: string;
  let runId: string;
  let transferId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const scopedCls = cls as unknown as ClsService;
    const tenant = new TenantPrismaService(prisma, scopedCls);
    const policies = new PoliciesService(
      prisma,
      scopedCls,
      new CapabilitiesService(prisma),
    );
    service = new ActionCenterService(
      tenant,
      new ProcurementService(tenant, policies),
      new StockTransfersService(prisma),
    );

    businessId = (
      await prisma.business.create({
        data: {
          name: 'Inventory Agent Action Source',
          slug: `inv-action-source-${stamp}`,
        },
      })
    ).id;
    destinationBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Inventory Agent Action Destination',
          slug: `inv-action-dest-${stamp}`,
        },
      })
    ).id;
    foreignBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Inventory Agent Action Foreign',
          slug: `inv-action-foreign-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    [sourceProductId, destinationProductId] = await Promise.all([
      prisma.product
        .create({
          data: {
            businessId,
            name: 'Inventory Agent Transfer Source Item',
            sku: `INV-ACTION-${stamp}`,
            stockQty: 14,
          },
          select: { id: true },
        })
        .then((row) => row.id),
      prisma.product
        .create({
          data: {
            businessId: destinationBusinessId,
            name: 'Inventory Agent Transfer Destination Item',
            sku: `INV-ACTION-${stamp}`,
            stockQty: 2,
          },
          select: { id: true },
        })
        .then((row) => row.id),
    ]);

    runId = (
      await prisma.specialistAgentRun.create({
        data: {
          businessId,
          agentKey: 'inventory_intelligence',
          agentVersion: '1.0',
          moduleId: '13',
          status: 'completed',
          output: {},
          policyResult: {},
        },
        select: { id: true },
      })
    ).id;
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId,
        agentKey: 'inventory_intelligence',
        title: 'Rebalance verified surplus stock',
        summary: 'A branch transfer draft was prepared for owner review.',
        classification: 'action',
        details: {},
        assumptions: [],
        missingData: [],
        confidenceMethod: 'uncalibrated',
        riskTier: 'medium',
        approvalRequired: true,
        status: 'handed_off',
      },
      select: { id: true },
    });
    transferId = (
      await prisma.stockTransfer.create({
        data: {
          sourceBusinessId: businessId,
          destBusinessId: destinationBusinessId,
          requestedByUserId: 'inventory-agent-requester',
          sourceSpecialistAgentRecommendationId: recommendation.id,
          items: { create: { sourceProductId, qty: 4 } },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.actionItemState.deleteMany({ where: { businessId } });
      const transfers = await prisma.stockTransfer.findMany({
        where: {
          OR: [
            { sourceBusinessId: businessId },
            { destBusinessId: businessId },
            { sourceBusinessId: destinationBusinessId },
            { destBusinessId: destinationBusinessId },
          ],
        },
        select: { id: true },
      });
      await prisma.stockTransferItem.deleteMany({
        where: { transferId: { in: transfers.map((row) => row.id) } },
      });
      await prisma.stockTransfer.deleteMany({
        where: {
          OR: [
            { sourceBusinessId: businessId },
            { destBusinessId: businessId },
            { sourceBusinessId: destinationBusinessId },
            { destBusinessId: destinationBusinessId },
          ],
        },
      });
      await prisma.specialistAgentRecommendation.deleteMany({
        where: { businessId },
      });
      await prisma.specialistAgentRun.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({
        where: { businessId: { in: [businessId, destinationBusinessId] } },
      });
      await prisma.business.deleteMany({
        where: {
          id: { in: [businessId, destinationBusinessId, foreignBusinessId] },
        },
      });
    }
    await prisma.$disconnect();
  });

  it('lists only tenant-owned pending Inventory Agent transfers and routes decisions canonically', async () => {
    const listed = await service.list(businessId, Role.owner, null, {});
    const item = listed.items.find(
      (candidate) =>
        candidate.id ===
        `${ActionItemType.inventory_transfer_approval}:${transferId}`,
    );
    expect(item).toMatchObject({
      type: ActionItemType.inventory_transfer_approval,
      approvalAction: 'inventory_branch_transfer',
      title:
        'Inventory Agent · Branch transfer to Inventory Agent Action Destination',
      reason: '1 line(s) · Recommendation: Rebalance verified surplus stock',
      deepLink: '/branches/transfers',
    });
    expect(item?.reason).not.toContain(sourceProductId);

    await expect(service.dismiss(businessId, item!.id)).rejects.toMatchObject({
      response: { code: 'INVENTORY_TRANSFER_REQUIRES_DECISION' },
    });
    await expect(
      service.approveInventoryAgentTransferAction(
        foreignBusinessId,
        'foreign-approver',
        item!.id,
      ),
    ).rejects.toThrow('Stock transfer not found');

    const approved = await service.approveInventoryAgentTransferAction(
      businessId,
      'authorized-approver',
      item!.id,
    );
    expect(approved.status).toBe('approved');
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: sourceProductId },
      }),
    ).toMatchObject({ stockQty: 14 });
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: destinationProductId },
      }),
    ).toMatchObject({ stockQty: 2 });
    expect(
      (await service.list(businessId, Role.owner, null, {})).items,
    ).not.toContainEqual(expect.objectContaining({ id: item!.id }));

    const secondRecommendation =
      await prisma.specialistAgentRecommendation.create({
        data: {
          businessId,
          runId,
          agentKey: 'inventory_intelligence',
          title: 'Review alternate transfer draft',
          summary: 'A second branch transfer draft is pending review.',
          classification: 'action',
          details: {},
          assumptions: [],
          missingData: [],
          confidenceMethod: 'uncalibrated',
          riskTier: 'medium',
          approvalRequired: true,
          status: 'handed_off',
        },
        select: { id: true },
      });
    const secondTransfer = await prisma.stockTransfer.create({
      data: {
        sourceBusinessId: businessId,
        destBusinessId: destinationBusinessId,
        requestedByUserId: 'inventory-agent-requester',
        sourceSpecialistAgentRecommendationId: secondRecommendation.id,
        items: { create: { sourceProductId, qty: 2 } },
      },
      select: { id: true },
    });
    const secondItem = (
      await service.list(businessId, Role.owner, null, {})
    ).items.find(
      (candidate) =>
        candidate.id ===
        `${ActionItemType.inventory_transfer_approval}:${secondTransfer.id}`,
    );
    expect(secondItem).toBeDefined();
    const rejected = await service.rejectInventoryAgentTransferAction(
      businessId,
      'authorized-approver',
      secondItem!.id,
      'The destination stock was not verified.',
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.note).toContain('The destination stock was not verified.');
  });
});
