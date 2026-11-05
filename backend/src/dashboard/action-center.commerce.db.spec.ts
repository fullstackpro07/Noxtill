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
import { StockTransfersService } from '../branches/stock-transfers.service';
import { ProcurementService } from '../procurement/procurement.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';

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
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ActionCenterService(
      tenantPrisma,
      new ProcurementService(
        tenantPrisma,
        new PoliciesService(
          prisma,
          cls as unknown as ClsService,
          new CapabilitiesService(prisma),
        ),
      ),
      new StockTransfersService(prisma),
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
    await prisma.commerceAgentToolRun.deleteMany({ where: { businessId } });
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

  it('surfaces Commerce Agent quote approvals centrally and disallows generic dismissal', async () => {
    const run = await prisma.commerceAgentToolRun.create({
      data: {
        businessId,
        toolKey: 'award_rfq_quote',
        riskClass: 'FINANCIAL',
        actorType: 'user',
        actorUserId: 'rfq-requester',
        autonomyLevel: 5,
        input: {
          rfqId: 'rfq-approval-target',
          quoteId: 'quote-approval-target',
          expectedVersion: '4',
          reason: 'Selected the lowest-cost eligible quote.',
        },
        outcome: 'pending_approval',
        correlationId: `action-center-${stamp}`,
        durationMs: 0,
      },
    });

    const requesterResult = await service.list(
      businessId,
      Role.owner,
      null,
      {},
      'rfq-requester',
    );
    const requesterItem = requesterResult.items.find(
      (item) => item.id === `commerce:agent_tool_award:${run.id}`,
    );
    expect(requesterItem).toMatchObject({
      type: ActionItemType.commerce,
      approvalAction: 'commerce_rfq_award',
      canDecide: false,
      deepLink: `/autonomous-commerce/agent-tools#run-${run.id}`,
    });

    const approverResult = await service.list(
      businessId,
      Role.owner,
      null,
      {},
      'different-authorized-user',
    );
    const approverItem = approverResult.items.find(
      (item) => item.id === `commerce:agent_tool_award:${run.id}`,
    );
    expect(approverItem?.canDecide).toBe(true);
    const decisionRequiredMessage =
      'Commerce Agent quote awards must be approved or rejected through the canonical agent approval action.';
    await expect(
      service.dismiss(businessId, `commerce:agent_tool_award:${run.id}`),
    ).rejects.toThrow(decisionRequiredMessage);
    await expect(
      service.snooze(businessId, `commerce:agent_tool_award:${run.id}`, {
        duration: '1h',
      }),
    ).rejects.toThrow(decisionRequiredMessage);
    await expect(
      service.complete(businessId, `commerce:agent_tool_award:${run.id}`),
    ).rejects.toThrow(decisionRequiredMessage);
  });

  it('surfaces supplier-claim submission approvals centrally and protects them from generic actions', async () => {
    const run = await prisma.commerceAgentToolRun.create({
      data: {
        businessId,
        toolKey: 'submit_supplier_claim',
        riskClass: 'MEDIUM_RISK_WRITE',
        actorType: 'user',
        actorUserId: 'claim-requester',
        autonomyLevel: 2,
        input: {
          claimId: 'supplier-claim-approval-target',
          expectedVersion: 3,
          reason: 'Supporting evidence has been checked.',
        },
        outcome: 'pending_approval',
        correlationId: `action-center-claim-${stamp}`,
        durationMs: 0,
      },
    });

    const requesterResult = await service.list(
      businessId,
      Role.owner,
      null,
      {},
      'claim-requester',
    );
    const requesterItem = requesterResult.items.find(
      (item) => item.id === `commerce:agent_tool_supplier_claim:${run.id}`,
    );
    expect(requesterItem).toMatchObject({
      type: ActionItemType.commerce,
      approvalAction: 'commerce_supplier_claim',
      canDecide: false,
      title: 'Commerce Agent · supplier claim needs approval',
      reason:
        'A second authorized user must review this claim submission. Approval marks it submitted for follow-up; it does not contact the supplier.',
      deepLink: `/autonomous-commerce/agent-tools#run-${run.id}`,
    });

    const approverResult = await service.list(
      businessId,
      Role.owner,
      null,
      {},
      'different-claim-reviewer',
    );
    expect(
      approverResult.items.find(
        (item) => item.id === `commerce:agent_tool_supplier_claim:${run.id}`,
      )?.canDecide,
    ).toBe(true);

    const decisionRequiredMessage =
      'Commerce Agent supplier claims must be approved or rejected through the canonical agent approval action.';
    await expect(
      service.dismiss(
        businessId,
        `commerce:agent_tool_supplier_claim:${run.id}`,
      ),
    ).rejects.toThrow(decisionRequiredMessage);
    await expect(
      service.snooze(
        businessId,
        `commerce:agent_tool_supplier_claim:${run.id}`,
        {
          duration: '1h',
        },
      ),
    ).rejects.toThrow(decisionRequiredMessage);
    await expect(
      service.complete(
        businessId,
        `commerce:agent_tool_supplier_claim:${run.id}`,
      ),
    ).rejects.toThrow(decisionRequiredMessage);
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
