import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentDirectoryController } from './specialist-agent-directory.controller';

describe('SpecialistAgentDirectoryController configuration history access', () => {
  const directory = {
    list: jest.fn(),
    configuration: jest.fn().mockResolvedValue({ configVersion: 1 }),
    updateConfiguration: jest.fn().mockResolvedValue({ configVersion: 2 }),
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

  it('reads current safe configuration for the signed-in business', async () => {
    const owner = {
      businessId: 'business-a',
      role: Role.owner,
    } as AuthenticatedUser;
    directory.configuration.mockClear();

    await controller.configuration(owner, 'inventory_intelligence');

    expect(directory.configuration).toHaveBeenCalledWith(
      'business-a',
      'inventory_intelligence',
    );
  });

  it('allows the owner to update configuration and refuses a manager', async () => {
    const owner = {
      businessId: 'business-a',
      role: Role.owner,
      sub: 'owner-1',
    } as AuthenticatedUser;
    const input = {
      expectedVersion: 1,
      settings: { 'agents.inventoryEnabled': false },
    };
    directory.updateConfiguration.mockClear();

    await controller.updateConfiguration(
      owner,
      'inventory_intelligence',
      input,
    );

    expect(directory.updateConfiguration).toHaveBeenCalledWith(
      'business-a',
      'owner-1',
      'inventory_intelligence',
      input,
    );

    const manager = { ...owner, role: Role.manager } as AuthenticatedUser;
    try {
      await controller.updateConfiguration(
        manager,
        'inventory_intelligence',
        input,
      );
      throw new Error('Expected the manager request to be refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toMatchObject({
        code: 'SPECIALIST_AGENT_CONFIG_OWNER_REQUIRED',
      });
    }
    expect(directory.updateConfiguration).toHaveBeenCalledTimes(1);
  });
});
