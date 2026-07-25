import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformAdminGuard } from './platform-admin.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard (BE-072)', () => {
  it('allows a request whose x-admin-key matches the configured secret', () => {
    const config = { get: () => 'super-secret' } as unknown as ConfigService;
    const guard = new PlatformAdminGuard(config);
    expect(
      guard.canActivate(makeContext({ 'x-admin-key': 'super-secret' })),
    ).toBe(true);
  });

  it('rejects a request with the wrong key', () => {
    const config = { get: () => 'super-secret' } as unknown as ConfigService;
    const guard = new PlatformAdminGuard(config);
    expect(() =>
      guard.canActivate(makeContext({ 'x-admin-key': 'wrong' })),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when PLATFORM_ADMIN_KEY is not configured at all', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const guard = new PlatformAdminGuard(config);
    expect(() =>
      guard.canActivate(makeContext({ 'x-admin-key': 'anything' })),
    ).toThrow(ForbiddenException);
  });
});
