import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock };
    business: { findUnique: jest.Mock };
    businessUser: { findUnique: jest.Mock };
  };

  const authUser: AuthenticatedUser = {
    sub: 'u1',
    businessId: 'b1',
    role: 'owner',
    capabilities: [],
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      business: { findUnique: jest.fn() },
      businessUser: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('composes the user (with role from the token) and their business, including their businessUserId', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Amara Osei',
      email: 'amara@sunsethair.co',
      phone: null,
      twoFactorEnabled: false,
    });
    prisma.business.findUnique.mockResolvedValue({
      id: 'b1',
      name: 'Sunset Hair Studio',
      slug: 'sunset-hair-studio',
      currency: 'USD',
      locale: 'en',
      timezone: 'UTC',
      country: 'US',
      parentId: null,
      branches: [],
    });
    prisma.businessUser.findUnique.mockResolvedValue({ id: 'bu1' });

    const result = await service.me(authUser);

    expect(result.user).toEqual({
      id: 'u1',
      name: 'Amara Osei',
      email: 'amara@sunsethair.co',
      phone: null,
      twoFactorEnabled: false,
      role: 'owner',
      businessUserId: 'bu1',
    });
    expect(result.business.slug).toBe('sunset-hair-studio');
  });

  it('throws NotFoundException when the user row is gone', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.me(authUser)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the business row is gone', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Amara Osei',
      email: null,
      phone: null,
    });
    prisma.business.findUnique.mockResolvedValue(null);

    await expect(service.me(authUser)).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.me() — deactivated branches hidden (Branches depth fix, UPD-INT-012)', () => {
  let service: UsersService;
  let realPrisma: PrismaService;
  let userId: string;
  let parentId: string;
  let activeBranchId: string;
  let deactivatedBranchId: string;

  beforeAll(async () => {
    realPrisma = new PrismaService();
    await realPrisma.$connect();
    service = new UsersService(realPrisma);

    const user = await realPrisma.user.create({
      data: {
        name: 'Branch Filter Owner',
        phone: `+1${Date.now()}`,
        passwordHash: 'test-hash',
      },
    });
    userId = user.id;

    const parent = await realPrisma.business.create({
      data: { name: 'HQ', slug: `me-branches-hq-${Date.now()}` },
    });
    parentId = parent.id;
    const activeBranch = await realPrisma.business.create({
      data: {
        name: 'Active Branch',
        slug: `me-branches-active-${Date.now()}`,
        parentId,
      },
    });
    activeBranchId = activeBranch.id;
    const deactivatedBranch = await realPrisma.business.create({
      data: {
        name: 'Deactivated Branch',
        slug: `me-branches-inactive-${Date.now()}`,
        parentId,
        active: false,
      },
    });
    deactivatedBranchId = deactivatedBranch.id;

    await realPrisma.businessUser.create({
      data: { businessId: parentId, userId, role: 'owner' },
    });
  });

  afterAll(async () => {
    await realPrisma.businessUser.deleteMany({ where: { userId } });
    await realPrisma.business.delete({ where: { id: activeBranchId } });
    await realPrisma.business.delete({ where: { id: deactivatedBranchId } });
    await realPrisma.business.delete({ where: { id: parentId } });
    await realPrisma.user.delete({ where: { id: userId } });
    await realPrisma.$disconnect();
  });

  it('lists only the real active branch, not the real deactivated one', async () => {
    const result = await service.me({
      sub: userId,
      businessId: parentId,
      role: 'owner',
      capabilities: [],
    });

    const branchIds = result.business.branches.map((b: { id: string }) => b.id);
    expect(branchIds).toContain(activeBranchId);
    expect(branchIds).not.toContain(deactivatedBranchId);
  });
});
