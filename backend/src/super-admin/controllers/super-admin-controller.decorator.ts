import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../super-admin.guard';

/**
 * Every Super Admin route: skipped by the tenant JWT pipeline (`@Public()`, so no tenant token is
 * ever accepted here) and gated instead by `SuperAdminGuard` — the same arrangement as the legacy
 * `platform-admin` controller. Never add `@Public()` alone to an admin route.
 */
export const SuperAdminController = (path: string) =>
  applyDecorators(
    Controller(`super-admin/${path}`.replace(/\/$/, '')),
    Public(),
    UseGuards(SuperAdminGuard),
  );
