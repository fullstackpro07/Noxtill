import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPermission as Permission } from './super-admin.constants';

export const ADMIN_PERMISSION_KEY = 'superAdminPermission';
export const ADMIN_REAUTH_KEY = 'superAdminReauth';
export const ADMIN_OPEN_KEY = 'superAdminOpen';

/** Route requires this internal admin permission (super_admin always passes). */
export const AdminPermission = (permission: Permission) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);

/**
 * High-risk operation (PRD §22.1): the request body must carry a fresh `totpCode` from the
 * admin's authenticator, verified (and burned) by `SuperAdminGuard` before the handler runs.
 */
export const RequireReauth = () => SetMetadata(ADMIN_REAUTH_KEY, true);

/** Admin auth endpoints that run before a session exists (login / TOTP / refresh). */
export const AdminOpen = () => SetMetadata(ADMIN_OPEN_KEY, true);

export interface AdminContext {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  permissions: Permission[];
  sessionId: string;
}

/** Who did it and from where — written into every `platform_audit_logs` row. */
export interface AdminAuditContext {
  admin: AdminContext;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export type AdminRequest = Request & { admin?: AdminContext };

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminContext => {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    return req.admin!;
  },
);

export const AuditCtx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminAuditContext => {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const rid = req.headers['x-request-id'];
    return {
      admin: req.admin!,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: typeof rid === 'string' ? rid : null,
    };
  },
);
