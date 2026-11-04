import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentDirectoryController } from './specialist-agent-directory.controller';

describe('SpecialistAgentDirectoryController configuration history access', () => {
  const directory = {
    list: jest.fn(),
    configurationHistory: jest.fn().mockResolvedValue({ items: [] }),
  };
  const controller = new SpecialistAgentDirectoryController(directory as never);

  it('allows the business owner to read configuration history for their tenant', async () => {
    const owner = {
      businessId: 'business-a',
      role: Role.owner,
    } as AuthenticatedUser;

    await controller.configurationHistory(
      owner,
      'inventory_intelligence',
      '10',
    );

    expect(directory.configurationHistory).toHaveBeenCalledWith(
      'business-a',
      'inventory_intelligence',
      '10',
    );
  });

  it('refuses manager access before querying configuration history', () => {
    directory.configurationHistory.mockClear();
    const manager = {
      businessId: 'business-a',
      role: Role.manager,
    } as AuthenticatedUser;

    let thrown: unknown;
    try {
      void controller.configurationHistory(manager, 'inventory_intelligence');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    expect((thrown as AppException).getResponse()).toMatchObject({
      code: 'SPECIALIST_AGENT_CONFIG_OWNER_REQUIRED',
    });
    expect(directory.configurationHistory).not.toHaveBeenCalled();
  });
});
