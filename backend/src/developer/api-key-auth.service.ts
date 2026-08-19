import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { Capability } from '../common/capabilities/capabilities.constants';
import { Role } from '@prisma/client';

/**
 * Real API-key authentication (UPD-BE-081) — the read side `JwtAuthGuard` calls for any
 * `Authorization: Bearer ntk_...` request, resolving straight to the same `AuthenticatedUser`
 * shape a JWT produces so every existing `@RequireCapability(...)` gate, and `TenancyGuard`'s CLS
 * binding, work unchanged for an API-key-authenticated request — no separate authorization path.
 * `role` is set to the lowest flat role (`staff`) since a key's real permissions are its `scopes`,
 * not a role; nothing in this codebase's capability checks reads `role` once `capabilities` is present.
 */
@Injectable()
export class ApiKeyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(rawKey: string): Promise<AuthenticatedUser | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const row = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!row || row.revokedAt) return null;

    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      sub: `api-key:${row.id}`,
      businessId: row.businessId,
      role: Role.staff,
      capabilities: row.scopes as Capability[],
    };
  }
}
