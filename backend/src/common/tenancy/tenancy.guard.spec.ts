import { ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyGuard } from './tenancy.guard';
import { CLS_KEY_BUSINESS_ID } from './tenant.constants';
import { Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

function contextWith(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenancyGuard branch scoping (BE-059)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let guard: TenancyGuard;
  let parentId: string;
  let branchId: string;
  let unrelatedId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    guard = new TenancyGuard(cls as unknown as ClsService, prisma);

    const parent = await prisma.business.create({
      data: { name: 'Parent Co', slug: `tenancy-parent-${Date.now()}` },
    });
    parentId = parent.id;

    const branch = await prisma.business.create({
      data: {
        name: 'Branch Co',
        slug: `tenancy-branch-${Date.now()}`,
        parentId,
      },
    });
    branchId = branch.id;

    const unrelated = await prisma.business.create({
      data: { name: 'Unrelated Co', slug: `tenancy-unrelated-${Date.now()}` },
    });
    unrelatedId = unrelated.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: branchId } });
    await prisma.business.delete({ where: { id: parentId } });
    await prisma.business.delete({ where: { id: unrelatedId } });
    await prisma.$disconnect();
  });

  it('uses the JWT businessId when no branch header is sent', async () => {
    await guard.canActivate(
      contextWith({
        user: { sub: 'u1', businessId: parentId, role: Role.owner },
        headers: {},
      }),
    );
    expect(cls.get(CLS_KEY_BUSINESS_ID)).toBe(parentId);
  });

  it('honors X-Branch when it names a real child branch of the caller', async () => {
    await guard.canActivate(
      contextWith({
        user: { sub: 'u1', businessId: parentId, role: Role.owner },
        headers: { 'x-branch': branchId },
      }),
    );
    expect(cls.get(CLS_KEY_BUSINESS_ID)).toBe(branchId);
  });

  it('ignores X-Branch naming a business that is not a child of the caller', async () => {
    await guard.canActivate(
      contextWith({
        user: { sub: 'u1', businessId: parentId, role: Role.owner },
        headers: { 'x-branch': unrelatedId },
      }),
    );
    expect(cls.get(CLS_KEY_BUSINESS_ID)).toBe(parentId);
  });

  it('falls back to the query param when no header is present', async () => {
    await guard.canActivate(
      contextWith({
        user: { sub: 'u1', businessId: parentId, role: Role.owner },
        headers: {},
        query: { branch: branchId },
      }),
    );
    expect(cls.get(CLS_KEY_BUSINESS_ID)).toBe(branchId);
  });
});
