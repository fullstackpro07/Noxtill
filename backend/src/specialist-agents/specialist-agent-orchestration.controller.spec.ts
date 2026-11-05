import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentOrchestrationController } from './specialist-agent-orchestration.controller';

describe('SpecialistAgentOrchestrationController', () => {
  const orchestration = {
    listRuns: jest.fn(),
    run: jest.fn(),
    retryFailed: jest.fn(),
    cancelRun: jest.fn(),
  };
  const controller = new SpecialistAgentOrchestrationController(
    orchestration as never,
  );
  const user = (role: Role) =>
    ({
      sub: 'agent-owner-id',
      businessId: 'agent-business-id',
      role,
      capabilities: [],
    }) as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('limits cross-agent listing and execution to the business owner', async () => {
    expect(() => controller.list(user(Role.manager))).toThrow(AppException);
    expect(() =>
      controller.run(user(Role.staff), 'orchestration-key-0001'),
    ).toThrow(AppException);
    expect(orchestration.listRuns).not.toHaveBeenCalled();
    expect(orchestration.run).not.toHaveBeenCalled();
    expect(() =>
      controller.retryFailed(
        user(Role.staff),
        'orchestration-run-id',
        'orchestration-retry-key-0001',
      ),
    ).toThrow(AppException);
    expect(orchestration.retryFailed).not.toHaveBeenCalled();
    expect(() =>
      controller.cancel(user(Role.staff), 'orchestration-run-id'),
    ).toThrow(AppException);
    expect(orchestration.cancelRun).not.toHaveBeenCalled();

    orchestration.run.mockResolvedValue({ status: 'completed' });
    await expect(
      controller.run(user(Role.owner), 'orchestration-key-0001'),
    ).resolves.toEqual({ status: 'completed' });
    expect(orchestration.run).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'orchestration-key-0001',
    );
    orchestration.retryFailed.mockResolvedValue({ status: 'completed' });
    await expect(
      controller.retryFailed(
        user(Role.owner),
        'orchestration-run-id',
        'orchestration-retry-key-0001',
      ),
    ).resolves.toEqual({ status: 'completed' });
    expect(orchestration.retryFailed).toHaveBeenCalledWith(
      'agent-business-id',
      'agent-owner-id',
      'orchestration-run-id',
      'orchestration-retry-key-0001',
    );
    orchestration.cancelRun.mockResolvedValue({ status: 'cancel_requested' });
    await expect(
      controller.cancel(user(Role.owner), 'orchestration-run-id'),
    ).resolves.toEqual({ status: 'cancel_requested' });
    expect(orchestration.cancelRun).toHaveBeenCalledWith(
      'agent-business-id',
      'orchestration-run-id',
      'agent-owner-id',
    );
  });
});
