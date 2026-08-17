import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilitiesGuard } from './capabilities.guard';
import { CAPABILITIES } from '../capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../tenancy/auth-context';
import { Role } from '../../../generated/prisma';

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
    const guard = new CapabilitiesGuard(reflector);
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
    const guard = new CapabilitiesGuard(reflector);
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
    const guard = new CapabilitiesGuard(reflector);
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
    const guard = new CapabilitiesGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
