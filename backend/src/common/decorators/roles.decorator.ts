import { SetMetadata } from '@nestjs/common';
import { Role } from '../../../generated/prisma';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed roles. Owner is implicitly allowed everywhere unless explicitly excluded via RolesGuard logic. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
