import { HttpStatus } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BusinessModulesController } from './business-modules.controller';
import { BusinessModulesService } from './business-modules.service';

describe('BusinessModulesController', () => {
  const setSelection = jest.fn();
  const controller = new BusinessModulesController({
    setSelection,
  } as unknown as BusinessModulesService);

  beforeEach(() => setSelection.mockReset());

  it('allows the owner to save an explicit module selection', async () => {
    setSelection.mockResolvedValue(['credit']);
    const owner = {
      businessId: 'business-1',
      role: Role.owner,
    } as AuthenticatedUser;

    await expect(
      controller.saveSelection(owner, { enabled: ['sales'] }),
    ).resolves.toEqual({ disabled: ['credit'] });
    expect(setSelection).toHaveBeenCalledWith('business-1', ['sales']);
  });

  it('rejects a non-owner before changing the selection', async () => {
    const staff = {
      businessId: 'business-1',
      role: Role.staff,
    } as AuthenticatedUser;

    try {
      await controller.saveSelection(staff, { enabled: ['sales'] });
      throw new Error('Expected module selection to be owner-only');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((error as AppException).getResponse()).toMatchObject({
        code: 'BUSINESS_MODULE_OWNER_REQUIRED',
      });
    }
    expect(setSelection).not.toHaveBeenCalled();
  });
});
