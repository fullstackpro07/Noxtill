import { ClsService } from 'nestjs-cls';
import { WorkflowTriggerKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { WorkflowVariablesService } from './workflow-variables.service';

jest.setTimeout(60_000);

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('WorkflowVariablesService (MySQL)', () => {
  let prisma: PrismaService;
  let service: WorkflowVariablesService;
  let businessId: string;
  let otherBusinessId: string;
  let workflowId: string;
  let branchId: string;
  const businessIds: string[] = [];
  const cls = new FakeClsService();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WorkflowVariablesService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    const suffix = Date.now().toString();
    const [business, otherBusiness] = await Promise.all([
      prisma.business.create({
        data: { name: 'Workflow Variables Test', slug: `workflow-vars-${suffix}` },
      }),
      prisma.business.create({
        data: {
          name: 'Workflow Variables Other Test',
          slug: `workflow-vars-other-${suffix}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    businessIds.push(business.id, otherBusiness.id);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Variable test workflow',
        triggerKey: WorkflowTriggerKey.sale,
      },
    });
    workflowId = workflow.id;
    const branch = await prisma.business.create({
      data: {
        name: 'Variable test branch',
        slug: `workflow-vars-branch-${suffix}`,
        parentId: businessId,
      },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    if (businessIds.length > 0) {
      await prisma.workflowVariable.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.workflow.deleteMany({ where: { businessId } });
    }
    if (branchId) {
      await prisma.business.deleteMany({ where: { id: branchId } });
    }
    if (businessIds.length > 0) {
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    }
    await prisma.$disconnect();
  });

  it('persists typed values for business, workflow and branch scopes', async () => {
    const text = await service.create(businessId, 'test-owner', {
      scope: 'business',
      environment: 'staging',
      name: 'greeting',
      valueType: 'string',
      value: 'Hello',
    });
    const numeric = await service.create(businessId, 'test-owner', {
      scope: 'workflow',
      scopeId: workflowId,
      name: 'minimumTotal',
      valueType: 'number',
      value: 84.5,
    });
    const json = await service.create(businessId, 'test-owner', {
      scope: 'branch',
      scopeId: branchId,
      name: 'regionalSettings',
      valueType: 'json',
      value: { currency: 'EUR', enabled: true },
    });

    expect(text).toMatchObject({
      scope: 'business',
      scopeId: null,
      environment: 'staging',
      name: 'greeting',
      value: 'Hello',
    });
    expect(numeric).toMatchObject({
      scope: 'workflow',
      scopeId: workflowId,
      value: 84.5,
    });
    expect(json).toMatchObject({
      scope: 'branch',
      scopeId: branchId,
      value: { currency: 'EUR', enabled: true },
    });
  });

  it('stores a secret reference without returning its reference or secret value', async () => {
    const variable = await service.create(businessId, 'test-owner', {
      scope: 'business',
      name: 'twilioToken',
      valueType: 'secret_reference',
      secretReference: 'env:TWILIO_AUTH_TOKEN',
    });

    expect(variable.secretReferenceConfigured).toBe(true);
    expect(variable).not.toHaveProperty('secretReference');
    expect(JSON.stringify(variable)).not.toContain('TWILIO_AUTH_TOKEN');
    expect(JSON.stringify(variable)).not.toContain('YOUR_SECRET');
  });

  it('rejects invalid values, foreign scope IDs and cross-tenant reads', async () => {
    await expect(
      service.create(businessId, 'test-owner', {
        scope: 'workflow',
        scopeId: workflowId,
        name: 'badNumber',
        valueType: 'number',
        value: 'not a number',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'workflow.variable_invalid_value' }),
    });

    await expect(
      service.create(businessId, 'test-owner', {
        scope: 'workflow',
        scopeId: 'workflow-owned-by-another-business',
        name: 'foreignWorkflow',
        valueType: 'string',
        value: 'no',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'workflow.variable_invalid_scope' }),
    });

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const result = await service.list(businessId, {});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  it('supports update and delete without exposing secret references', async () => {
    const created = await service.create(businessId, 'test-owner', {
      scope: 'business',
      name: 'supportMessage',
      valueType: 'string',
      value: 'Before update',
    });
    const updated = await service.update(
      businessId,
      'test-owner',
      created.id,
      { value: 'After update', description: 'A real business variable' },
    );

    expect(updated).toMatchObject({
      name: 'supportMessage',
      value: 'After update',
      description: 'A real business variable',
    });
    await expect(service.remove(businessId, created.id)).resolves.toEqual({
      deleted: true,
    });
    await expect(service.remove(businessId, created.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'workflow.variable_not_found' }),
    });
  });
});
