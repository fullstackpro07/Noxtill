import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilitiesGuard } from './capabilities.guard';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CAPABILITIES } from '../capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../tenancy/auth-context';
import { Role } from '@prisma/client';

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('CapabilitiesGuard (UPD-BE-035)', () => {
  it('allows any authenticated role when no @RequireCapability metadata is present', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new CapabilitiesGuard(
      reflector,
      {} as unknown as CapabilitiesService,
    );
    expect(
      guard.canActivate(
        makeContext({
          sub: 'u1',
          businessId: 'b1',
          role: Role.staff,
          capabilities: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows a caller whose resolved capabilities include the required one', () => {
    const reflector = {
      getAllAndOverride: () => CAPABILITIES.RETURNS_APPROVE,
    } as unknown as Reflector;
    const guard = new CapabilitiesGuard(
      reflector,
      {} as unknown as CapabilitiesService,
    );
    expect(
      guard.canActivate(
        makeContext({
          sub: 'u1',
          businessId: 'b1',
          role: Role.manager,
          capabilities: [CAPABILITIES.RETURNS_APPROVE],
        }),
      ),
    ).toBe(true);
  });

  it('rejects a caller whose resolved capabilities do not include the required one', () => {
    const reflector = {
      getAllAndOverride: () => CAPABILITIES.BILLING_MANAGE,
    } as unknown as Reflector;
    const guard = new CapabilitiesGuard(
      reflector,
      {} as unknown as CapabilitiesService,
    );
    expect(() =>
      guard.canActivate(
        makeContext({
          sub: 'u1',
          businessId: 'b1',
          role: Role.manager,
          capabilities: [CAPABILITIES.RETURNS_APPROVE],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request against a gated route', () => {
    const reflector = {
      getAllAndOverride: () => CAPABILITIES.BILLING_MANAGE,
    } as unknown as Reflector;
    const guard = new CapabilitiesGuard(
      reflector,
      {} as unknown as CapabilitiesService,
    );
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  describe('live custom-role enforcement (Staff depth fix, UPD-INT-011)', () => {
    it('re-resolves a custom-role holder live instead of trusting the cached JWT snapshot', async () => {
      const reflector = {
        getAllAndOverride: () => CAPABILITIES.BILLING_MANAGE,
      } as unknown as Reflector;
      const resolve = jest
        .fn()
        .mockResolvedValue([CAPABILITIES.BILLING_MANAGE]);
      const guard = new CapabilitiesGuard(reflector, {
        resolve,
      } as unknown as CapabilitiesService);

      const result = await guard.canActivate(
        makeContext({
          sub: 'u1',
          businessId: 'b1',
          role: Role.staff,
          // Deliberately stale/empty — proves the live lookup, not this array, decides the outcome.
          capabilities: [],
          customRoleId: 'cr1',
        }),
      );

      expect(result).toBe(true);
      expect(resolve).toHaveBeenCalledWith({
        role: Role.staff,
        customRoleId: 'cr1',
      });
    });

    it('rejects a custom-role holder once the role no longer grants the required capability, even though their cached JWT snapshot still does', async () => {
      const reflector = {
        getAllAndOverride: () => CAPABILITIES.BILLING_MANAGE,
      } as unknown as Reflector;
      // The live role was just edited to no longer include this capability.
      const resolve = jest.fn().mockResolvedValue([]);
      const guard = new CapabilitiesGuard(reflector, {
        resolve,
      } as unknown as CapabilitiesService);

      await expect(
        guard.canActivate(
          makeContext({
            sub: 'u1',
            businessId: 'b1',
            role: Role.staff,
            // Stale cached snapshot from before the edit — must NOT be trusted.
            capabilities: [CAPABILITIES.BILLING_MANAGE],
            customRoleId: 'cr1',
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
