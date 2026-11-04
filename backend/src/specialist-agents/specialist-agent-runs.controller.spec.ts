import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentRunsController } from './specialist-agent-runs.controller';

describe('SpecialistAgentRunsController', () => {
  const runs = {
    get: jest.fn(),
    list: jest.fn(),
    listEvidence: jest.fn(),
    listEvents: jest.fn(),
    listToolCalls: jest.fn(),
  };
  const controller = new SpecialistAgentRunsController(runs as never);
  const user = (role: Role) =>
    ({
      sub: 'run-owner-id',
      businessId: 'run-business-id',
      role,
      capabilities: [],
    }) as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  it('allows only the owner to list safe cross-module run summaries', async () => {
    expect(() => controller.list(user(Role.manager), {})).toThrow(AppException);
    expect(runs.list).not.toHaveBeenCalled();

    runs.list.mockResolvedValue({ items: [], nextCursor: null, pageSize: 25 });
    const query = { limit: 25, agentKey: 'seo_autopilot' };
    await expect(controller.list(user(Role.owner), query)).resolves.toEqual({
      items: [],
      nextCursor: null,
      pageSize: 25,
    });
    expect(runs.list).toHaveBeenCalledWith('run-business-id', query);
  });

  it('allows only the owner to read cross-module run details', async () => {
    expect(() => controller.get(user(Role.manager), 'run-id')).toThrow(
      AppException,
    );
    expect(runs.get).not.toHaveBeenCalled();

    runs.get.mockResolvedValue({ id: 'run-id' });
    await expect(controller.get(user(Role.owner), 'run-id')).resolves.toEqual({
      id: 'run-id',
    });
    expect(runs.get).toHaveBeenCalledWith('run-business-id', 'run-id');
  });

  it('restricts evidence access to the owner and passes only the tenant run scope', async () => {
    expect(() => controller.evidence(user(Role.manager), 'run-id')).toThrow(
      AppException,
    );
    expect(runs.listEvidence).not.toHaveBeenCalled();

    runs.listEvidence.mockResolvedValue({ items: [], nextCursor: null });
    const result = await controller.evidence(
      user(Role.owner),
      'run-id',
      'cursor-id',
    );
    expect(result).toEqual({ items: [], nextCursor: null });
    expect(runs.listEvidence).toHaveBeenCalledWith(
      'run-business-id',
      'run-id',
      'cursor-id',
    );
  });

  it('restricts tool-call diagnostics to the owner and passes only the tenant run scope', async () => {
    expect(() => controller.toolCalls(user(Role.manager), 'run-id')).toThrow(
      AppException,
    );
    expect(runs.listToolCalls).not.toHaveBeenCalled();

    runs.listToolCalls.mockResolvedValue({ items: [], hasMore: false });
    await expect(
      controller.toolCalls(user(Role.owner), 'run-id'),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(runs.listToolCalls).toHaveBeenCalledWith(
      'run-business-id',
      'run-id',
    );
  });

  it('restricts lifecycle events to the owner and passes the tenant run scope and page query', async () => {
    const query = { limit: 25 };
    expect(() =>
      controller.events(user(Role.manager), 'run-id', query),
    ).toThrow(AppException);
    expect(runs.listEvents).not.toHaveBeenCalled();

    runs.listEvents.mockResolvedValue({
      runId: 'run-id',
      items: [],
      nextCursor: null,
      hasMore: false,
      pageSize: 25,
      payloadValuesRedacted: true,
    });
    await expect(
      controller.events(user(Role.owner), 'run-id', query),
    ).resolves.toEqual({
      runId: 'run-id',
      items: [],
      nextCursor: null,
      hasMore: false,
      pageSize: 25,
      payloadValuesRedacted: true,
    });
    expect(runs.listEvents).toHaveBeenCalledWith(
      'run-business-id',
      'run-id',
      query,
    );
  });
});
