import { PrismaService } from '../../prisma/prisma.service';
import { CapabilitiesService } from './capabilities.service';
import {
  CAPABILITIES,
  SYSTEM_ROLE_CAPABILITIES,
} from './capabilities.constants';
import { Role } from '@prisma/client';

describe('CapabilitiesService (UPD-BE-035)', () => {
  let prisma: PrismaService;
  let service: CapabilitiesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new CapabilitiesService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'Capabilities Test Biz',
        slug: `capabilities-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.customRole.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('resolves each system role to its real default capability set when no custom role is assigned', async () => {
    expect(
      await service.resolve({ role: Role.owner, customRoleId: null }),
    ).toEqual(SYSTEM_ROLE_CAPABILITIES[Role.owner]);
    expect(
      await service.resolve({ role: Role.manager, customRoleId: null }),
    ).toEqual(SYSTEM_ROLE_CAPABILITIES[Role.manager]);
    expect(
      await service.resolve({ role: Role.staff, customRoleId: null }),
    ).toEqual(SYSTEM_ROLE_CAPABILITIES[Role.staff]);
  });

  it("a real custom role's capabilities replace the system role default entirely", async () => {
    const customRole = await prisma.customRole.create({
      data: {
        businessId,
        name: 'Narrow Role',
        capabilities: [CAPABILITIES.RETURNS_APPROVE],
      },
    });

    const resolved = await service.resolve({
      role: Role.owner,
      customRoleId: customRole.id,
    });
    // Even an "owner" row with a custom role gets exactly the custom role's set, not owner's superset.
    expect(resolved).toEqual([CAPABILITIES.RETURNS_APPROVE]);
  });

  it('falls back to the system role default when the referenced custom role no longer exists', async () => {
    const resolved = await service.resolve({
      role: Role.manager,
      customRoleId: 'not-a-real-custom-role-id',
    });
    expect(resolved).toEqual(SYSTEM_ROLE_CAPABILITIES[Role.manager]);
  });
});
