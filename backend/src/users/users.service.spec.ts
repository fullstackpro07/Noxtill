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
