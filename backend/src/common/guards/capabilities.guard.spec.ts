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

  it('allows an owner whose cached JWT capabilities include the required one (fast path, zero I/O)', () => {
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
          role: Role.owner,
          capabilities: [CAPABILITIES.RETURNS_APPROVE],
        }),
      ),
    ).toBe(true);
  });

  it('rejects an owner whose cached JWT capabilities do not include the required one', () => {
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
          role: Role.owner,
          capabilities: [CAPABILITIES.RETURNS_APPROVE],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  describe('live manager/staff enforcement (Roles & Permissions overrides, UPD-BE-STAFF-01)', () => {
    it('allows a manager/staff caller whose live-resolved capabilities include the required one, even with a stale empty JWT snapshot', async () => {
      const reflector = {
        getAllAndOverride: () => CAPABILITIES.RETURNS_APPROVE,
      } as unknown as Reflector;
      const resolve = jest
        .fn()
        .mockResolvedValue([CAPABILITIES.RETURNS_APPROVE]);
      const guard = new CapabilitiesGuard(reflector, {
        resolve,
      } as unknown as CapabilitiesService);

      const result = await guard.canActivate(
        makeContext({
          sub: 'u1',
          businessId: 'b1',
          role: Role.manager,
          capabilities: [],
        }),
      );

      expect(result).toBe(true);
      expect(resolve).toHaveBeenCalledWith({
        businessId: 'b1',
        role: Role.manager,
        customRoleId: null,
      });
    });

    it('rejects a manager/staff caller once a RoleCapabilityOverride removes the required capability, even though their cached JWT snapshot still has it', async () => {
      const reflector = {
        getAllAndOverride: () => CAPABILITIES.BILLING_MANAGE,
      } as unknown as Reflector;
      const resolve = jest.fn().mockResolvedValue([]);
      const guard = new CapabilitiesGuard(reflector, {
        resolve,
      } as unknown as CapabilitiesService);

      await expect(
        guard.canActivate(
          makeContext({
            sub: 'u1',
            businessId: 'b1',
            role: Role.manager,
            capabilities: [CAPABILITIES.BILLING_MANAGE],
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
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
        businessId: 'b1',
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

  describe('API-key callers (Integrations redesign)', () => {
    const guardWith = (required: string) =>
      new CapabilitiesGuard(
        { getAllAndOverride: () => required } as unknown as Reflector,
        // A live re-resolve of the nominal staff role would grant nothing — it must not be consulted.
        {
          resolve: () => Promise.resolve([]),
        } as unknown as CapabilitiesService,
      );
    const keyUser = (
      capabilities: AuthenticatedUser['capabilities'],
    ): AuthenticatedUser => ({
      sub: 'api-key:key-1',
      businessId: 'b1',
      role: Role.staff,
      capabilities,
    });

    it('honours the scopes the key was created with', () => {
      const guard = guardWith(CAPABILITIES.INTEGRATIONS_MANAGE);
      expect(
        guard.canActivate(
          makeContext(keyUser([CAPABILITIES.INTEGRATIONS_MANAGE])),
        ),
      ).toBe(true);
    });

    it('rejects a route whose capability is not among the key’s scopes', () => {
      const guard = guardWith(CAPABILITIES.ADS_MANAGE);
      expect(() =>
        guard.canActivate(
          makeContext(keyUser([CAPABILITIES.INTEGRATIONS_MANAGE])),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
