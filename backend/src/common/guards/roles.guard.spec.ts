import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../../../generated/prisma';

function makeContext(role?: Role): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { sub: 'u1', businessId: 'b1', role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (BE-008)', () => {
  it('allows any authenticated role when no @Roles metadata is present', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext(Role.staff))).toBe(true);
  });

  it('allows a role listed in @Roles(...)', () => {
    const reflector = {
      getAllAndOverride: () => [Role.owner, Role.manager],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext(Role.manager))).toBe(true);
  });

  it('blocks staff from an owner/manager-only route', () => {
    const reflector = {
      getAllAndOverride: () => [Role.owner, Role.manager],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext(Role.staff))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks unauthenticated requests from a role-gated route', () => {
    const reflector = {
      getAllAndOverride: () => [Role.owner],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
