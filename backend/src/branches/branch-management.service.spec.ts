import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BranchManagementService } from './branch-management.service';
import { AppException } from '../common/filters/app.exception';

describe('BranchManagementService (UPD-BE-036 follow-up)', () => {
  let prisma: PrismaService;
  let service: BranchManagementService;
  let rootId: string;
  let existingUserId: string;
  const createdBusinessIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BranchManagementService(prisma);

    const root = await prisma.business.create({
      data: {
        name: 'Root HQ',
        slug: `root-hq-${Date.now()}`,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
      },
    });
    rootId = root.id;
    createdBusinessIds.push(rootId);

    const existingUser = await prisma.user.create({
      data: {
        name: 'Existing Multi-Business Owner',
        email: `existing-owner-${Date.now()}@test.com`,
        passwordHash: 'irrelevant-hash',
      },
    });
    existingUserId = existingUser.id;
    createdUserIds.push(existingUserId);
  });

  afterAll(async () => {
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: createdBusinessIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: createdBusinessIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('creates a real branch under the caller, with a new owner + real hashed temp password', async () => {
    const result = await service.create(rootId, {
      name: 'Branch One',
      ownerName: 'Branch One Owner',
      ownerEmail: `branch-one-owner-${Date.now()}@test.com`,
    });
    createdBusinessIds.push(result.business.id);
    createdUserIds.push(result.businessUser.userId);

    expect(result.business.parentId).toBe(rootId);
    expect(result.business.currency).toBe('PKR'); // inherited from parent when not specified
    expect(result.businessUser.role).toBe('owner');
    expect(result.tempPassword).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.businessUser.userId },
    });
    const matches = await bcrypt.compare(
      result.tempPassword!,
      user.passwordHash,
    );
    expect(matches).toBe(true);
  });

  it('flattens the hierarchy: creating a branch from an existing branch parents it to the root, not the branch', async () => {
    const firstBranch = await service.create(rootId, {
      name: 'Branch Two',
      ownerName: 'Branch Two Owner',
      ownerPhone: `+1${Date.now()}1`,
    });
    createdBusinessIds.push(firstBranch.business.id);
    createdUserIds.push(firstBranch.businessUser.userId);

    // Create a THIRD branch, calling as Branch Two (already a branch, not the root).
    const grandchild = await service.create(firstBranch.business.id, {
      name: 'Branch Three',
      ownerName: 'Branch Three Owner',
      ownerPhone: `+1${Date.now()}2`,
    });
    createdBusinessIds.push(grandchild.business.id);
    createdUserIds.push(grandchild.businessUser.userId);

    expect(grandchild.business.parentId).toBe(rootId); // flattened, not firstBranch.business.id
  });

  it('reuses an existing real user identity as the new branch owner without generating a temp password', async () => {
    const existingUser = await prisma.user.findUniqueOrThrow({
      where: { id: existingUserId },
    });
    const result = await service.create(rootId, {
      name: 'Branch Four',
      ownerName: 'Ignored — real name comes from the existing user',
      ownerEmail: existingUser.email!,
    });
    createdBusinessIds.push(result.business.id);

    expect(result.tempPassword).toBeUndefined();
    expect(result.businessUser.userId).toBe(existingUserId);
  });

  it('rejects creating a branch with no owner identity at all', async () => {
    await expect(
      service.create(rootId, {
        name: 'No Identity Branch',
        ownerName: 'Nobody',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('lists the real branch group from both the root and a branch, including the newly created branches', async () => {
    const fromRoot = await service.list(rootId);
    const names = fromRoot.map((b) => b.name);
    expect(names).toContain('Root HQ');
    expect(names).toContain('Branch One');
    expect(names).toContain('Branch Two');
    expect(names).toContain('Branch Three');
    expect(names).toContain('Branch Four');

    const branchOne = fromRoot.find((b) => b.name === 'Branch One')!;
    const fromBranch = await service.list(branchOne.id);
    expect(fromBranch.map((b) => b.id).sort()).toEqual(
      fromRoot.map((b) => b.id).sort(),
    );
  });

  describe('update/deactivate/reactivate/copySettings (UPD-BE-109)', () => {
    let branchAId: string;
    let branchBId: string;

    beforeAll(async () => {
      const branchA = await service.create(rootId, {
        name: 'Settings Branch A',
        ownerName: 'A Owner',
        ownerPhone: `+1${Date.now()}9`,
      });
      branchAId = branchA.business.id;
      createdBusinessIds.push(branchAId);
      createdUserIds.push(branchA.businessUser.userId);

      const branchB = await service.create(rootId, {
        name: 'Settings Branch B',
        ownerName: 'B Owner',
        ownerPhone: `+1${Date.now()}8`,
      });
      branchBId = branchB.business.id;
      createdBusinessIds.push(branchBId);
      createdUserIds.push(branchB.businessUser.userId);
    });

    it('updates a real branch settings field', async () => {
      const updated = await service.update(rootId, branchAId, {
        taxLabel: 'VAT',
        taxRate: 15,
        nightlyCloseTime: '23:00',
      });
      expect(updated.taxLabel).toBe('VAT');
      expect(Number(updated.taxRate)).toBe(15);
      expect(updated.nightlyCloseTime).toBe('23:00');
    });

    it("rejects updating a branch outside the caller's own group", async () => {
      const outsideBusiness = await prisma.business.create({
        data: { name: 'Outside Biz', slug: `outside-biz-${Date.now()}` },
      });
      createdBusinessIds.push(outsideBusiness.id);

      await expect(
        service.update(rootId, outsideBusiness.id, { taxLabel: 'Hacked' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('deactivates and reactivates a real branch, but refuses to deactivate the root', async () => {
      const deactivated = await service.deactivate(rootId, branchAId);
      expect(deactivated.active).toBe(false);

      const reactivated = await service.reactivate(rootId, branchAId);
      expect(reactivated.active).toBe(true);

      await expect(service.deactivate(rootId, rootId)).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it('copies real settings fields from one branch onto another, leaving identity fields untouched', async () => {
      await service.update(rootId, branchAId, {
        taxLabel: 'GST',
        taxRate: 8,
        acceptedPaymentMethods: ['cash', 'online'],
      });

      const copied = await service.copySettings(rootId, branchBId, branchAId);
      expect(copied.taxLabel).toBe('GST');
      expect(Number(copied.taxRate)).toBe(8);
      expect(copied.acceptedPaymentMethods).toEqual(['cash', 'online']);
      expect(copied.name).toBe('Settings Branch B'); // identity untouched
    });
  });
});
