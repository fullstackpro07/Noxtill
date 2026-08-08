import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

describe('UsersController', () => {
  let controller: UsersController;
  let service: { me: jest.Mock };

  const authUser: AuthenticatedUser = {
    sub: 'u1',
    businessId: 'b1',
    role: 'owner' as AuthenticatedUser['role'],
  };

  beforeEach(async () => {
    service = { me: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to UsersService.me with the authenticated user from the request', async () => {
    const expected = { user: { id: 'u1' }, business: { id: 'b1' } };
    service.me.mockResolvedValue(expected);

    const result = await controller.me(authUser);

    expect(service.me).toHaveBeenCalledWith(authUser);
    expect(result).toBe(expected);
  });
});
