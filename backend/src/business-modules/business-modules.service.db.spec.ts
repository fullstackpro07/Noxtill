import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { BUSINESS_MODULES } from './business-modules.constants';
import { BusinessModulesService } from './business-modules.service';

describe('BusinessModulesService (MySQL)', () => {
  let prisma: PrismaService;
  let service: BusinessModulesService;
  let rootId: string;
  let branchId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BusinessModulesService(prisma);
    rootId = (
      await prisma.business.create({
        data: { name: 'Modules Root', slug: `modules-root-${stamp}` },
      })
    ).id;
    branchId = (
      await prisma.business.create({
        data: {
          name: 'Modules Branch',
          slug: `modules-branch-${stamp}`,
          parentId: rootId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: branchId } });
    await prisma.business.delete({ where: { id: rootId } });
    await prisma.$disconnect();
  });

  it('starts with every module on', async () => {
    const result = await service.list(rootId);
    expect(result.disabled).toEqual([]);
    expect(result.modules.every((module) => module.enabled)).toBe(true);
    expect(result.modules.map((module) => module.key)).not.toContain(
      'dashboard',
    );
    expect(result.modules.map((module) => module.key)).not.toContain(
      'settings',
    );
  });

  it('stores the choice on the root business so every branch shares it', async () => {
    await service.setEnabled(branchId, 'bookings', false);
    await service.setEnabled(rootId, 'credit', false);
    expect(await service.disabledFor(rootId)).toEqual(['bookings', 'credit']);
    expect(await service.disabledFor(branchId)).toEqual(['bookings', 'credit']);
    const branch = await prisma.business.findUniqueOrThrow({
      where: { id: branchId },
    });
    expect(branch.disabledModules).toEqual([]);

    await service.setEnabled(branchId, 'bookings', true);
    expect(await service.disabledFor(rootId)).toEqual(['credit']);
  });

  it('rejects unknown or always-on modules and ignores stale stored keys', async () => {
    for (const key of ['dashboard', 'settings', 'nope']) {
      await expect(
        service.setEnabled(rootId, key, false),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_MODULE_UNKNOWN' },
      });
    }
    await prisma.business.update({
      where: { id: rootId },
      data: { disabledModules: ['credit', 'removed-module', 42, 'credit'] },
    });
    expect(await service.disabledFor(branchId)).toEqual(['credit']);
  });

  it('persists an explicit onboarding selection and rejects disabled APIs with a typed error', async () => {
    const enabled = ['sales', 'orders'];
    const disabled = BUSINESS_MODULES.map((module) => module.key)
      .filter((key) => !enabled.includes(key))
      .sort();

    await expect(service.setSelection(branchId, enabled)).resolves.toEqual(
      disabled,
    );
    expect(await service.disabledFor(rootId)).toEqual(disabled);
    expect(await service.disabledFor(branchId)).toEqual(disabled);
    await expect(
      service.assertEnabled(rootId, 'sales'),
    ).resolves.toBeUndefined();

    try {
      await service.assertEnabled(branchId, 'autonomous-commerce');
      throw new Error('Expected the disabled module to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const appError = error as AppException;
      expect(appError.getStatus()).toBe(403);
      expect(appError.getResponse()).toMatchObject({
        code: 'BUSINESS_MODULE_DISABLED',
      });
    }

    await expect(
      service.setSelection(rootId, ['removed-module']),
    ).rejects.toMatchObject({
      response: { code: 'BUSINESS_MODULE_UNKNOWN' },
    });
  });
});
