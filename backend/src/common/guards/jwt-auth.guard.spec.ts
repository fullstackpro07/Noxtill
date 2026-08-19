import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyAuthService } from '../../developer/api-key-auth.service';
import type { AuthenticatedUser } from '../tenancy/auth-context';
import { Role } from '@prisma/client';

function makeContext(authorizationHeader: string | undefined): {
  context: ExecutionContext;
  request: { headers: { authorization?: string }; user?: AuthenticatedUser };
} {
  const request: {
    headers: { authorization?: string };
    user?: AuthenticatedUser;
  } = {
    headers: { authorization: authorizationHeader },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard API-key branch (UPD-BE-081)', () => {
  const reflector = {
    getAllAndOverride: () => undefined,
  } as unknown as Reflector;

  it('authenticates a Bearer ntk_ token via ApiKeyAuthService, never touching the JWT strategy', async () => {
    const resolvedUser: AuthenticatedUser = {
      sub: 'api-key:1',
      businessId: 'biz-1',
      role: Role.staff,
      capabilities: ['ads.manage'] as AuthenticatedUser['capabilities'],
    };
    const authenticate = jest.fn().mockResolvedValue(resolvedUser);
    const guard = new JwtAuthGuard(reflector, {
      authenticate,
    } as unknown as ApiKeyAuthService);

    const { context, request } = makeContext('Bearer ntk_realkeyvalue123');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authenticate).toHaveBeenCalledWith('ntk_realkeyvalue123');
    expect(request.user).toEqual(resolvedUser);
  });

  it('rejects an invalid/revoked ntk_ key with a real UnauthorizedException, not a silent pass-through', async () => {
    const authenticate = jest.fn().mockResolvedValue(null);
    const guard = new JwtAuthGuard(reflector, {
      authenticate,
    } as unknown as ApiKeyAuthService);
    const { context } = makeContext('Bearer ntk_revoked_or_fake');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('a plain JWT bearer token never reaches ApiKeyAuthService at all', async () => {
    const authenticate = jest.fn();
    const guard = new JwtAuthGuard(reflector, {
      authenticate,
    } as unknown as ApiKeyAuthService);
    // super.canActivate() (real Passport JWT verification) will reject this fake token —
    // the real assertion here is that the ntk_-specific branch is never entered for it.
    const { context } = makeContext('Bearer a.jwt.token');
    await guard.canActivate(context).catch(() => undefined);

    expect(authenticate).not.toHaveBeenCalled();
  });
});
