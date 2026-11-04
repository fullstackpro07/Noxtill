import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentActionsController } from './specialist-agent-actions.controller';

describe('SpecialistAgentActionsController', () => {
  const actions = {
    get: jest.fn(),
    list: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    execute: jest.fn(),
    cancel: jest.fn(),
  };
  const controller = new SpecialistAgentActionsController(actions as never);
  const user = (role: Role) =>
    ({
      sub: 'agent-owner-id',
      businessId: 'agent-business-id',
      role,
      capabilities: [],
    }) as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('allows only the owner to list cross-module action lifecycles', async () => {
    expect(() => controller.list(user(Role.manager), {})).toThrow(AppException);
    expect(actions.list).not.toHaveBeenCalled();

    actions.list.mockResolvedValue({
      items: [],
      nextCursor: null,
      pageSize: 25,
    });
    const query = { limit: 25 };
    await expect(controller.list(user(Role.owner), query)).resolves.toEqual({
      items: [],
      nextCursor: null,
      pageSize: 25,
    });
    expect(actions.list).toHaveBeenCalledWith('agent-business-id', query);
  });

  it('allows only the owner to read one cross-module action timeline', async () => {
    expect(() => controller.get(user(Role.manager), 'action-1')).toThrow(
      AppException,
    );
    expect(actions.get).not.toHaveBeenCalled();

    actions.get.mockResolvedValue({ id: 'action-1', eventHistory: [] });
    await expect(controller.get(user(Role.owner), 'action-1')).resolves.toEqual(
      { id: 'action-1', eventHistory: [] },
    );
    expect(actions.get).toHaveBeenCalledWith('agent-business-id', 'action-1');
  });

  it('allows only the owner to route decisions through canonical services', async () => {
    const input = { expectedVersion: 2, reason: 'Reviewed exact proposal.' };
    expect(() =>
      controller.approve(user(Role.manager), 'action-1', input),
    ).toThrow(AppException);
    expect(actions.approve).not.toHaveBeenCalled();

    actions.approve.mockResolvedValue({ status: 'approved' });
    await expect(
      controller.approve(user(Role.owner), 'action-1', input),
    ).resolves.toEqual({ status: 'approved' });
    expect(actions.approve).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'action-1',
      input,
    );

    actions.reject.mockResolvedValue({ status: 'rejected' });
    await expect(
      controller.reject(user(Role.owner), 'action-2', input),
    ).resolves.toEqual({ status: 'rejected' });
    expect(actions.reject).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'action-2',
      input,
    );

    actions.execute.mockResolvedValue({ status: 'verified' });
    await expect(
      controller.execute(user(Role.owner), 'action-3', input),
    ).resolves.toEqual({ status: 'verified' });
    expect(actions.execute).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'action-3',
      input,
    );

    actions.cancel.mockResolvedValue({ status: 'cancelled' });
    await expect(
      controller.cancel(user(Role.owner), 'action-4', input),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(actions.cancel).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'action-4',
      input,
    );
  });
});
