import {
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  API_KEY_FORBIDDEN_SCOPES,
  API_KEY_PREFIX,
  API_KEY_SECRET_BYTES,
  API_KEY_VISIBLE_PREFIX_LENGTH,
} from './api-key.constants';
import { Prisma } from '@prisma/client';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Developer & API (UPD-BE-081) — real bearer credentials scoped to a subset of `CAPABILITIES`.
 * The raw secret is generated here, hashed for storage, and returned to the caller exactly once —
 * same one-time-reveal UX as every real API-key product (Stripe, GitHub PATs, etc.); it can never
 * be recovered again, only revoked and replaced. `ApiKeyAuthService` is the read side used by
 * `JwtAuthGuard` to actually authenticate a request with one of these.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  list() {
    return this.tenantPrisma.client.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  async create(businessId: string, dto: CreateApiKeyDto) {
    const forbidden = dto.scopes.filter((s) =>
      (API_KEY_FORBIDDEN_SCOPES as readonly string[]).includes(s),
    );
    if (forbidden.length > 0) {
      throw new AppException(
        'API_KEY_SCOPE_FORBIDDEN',
        `These scopes cannot be granted to an API key: ${forbidden.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const rawKey = `${API_KEY_PREFIX}${randomBytes(API_KEY_SECRET_BYTES).toString('hex')}`;
    const row = await this.tenantPrisma.client.apiKey.create({
      data: {
        businessId,
        name: dto.name,
        keyHash: hashKey(rawKey),
        keyPrefix: rawKey.slice(0, API_KEY_VISIBLE_PREFIX_LENGTH),
        scopes: dto.scopes as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit?.log({
      entity: 'Integration',
      entityId: 'rest_api',
      action: 'integration.api_key_created',
      after: { name: dto.name, scopes: dto.scopes, keyPrefix: row.keyPrefix },
    });
    // The only time the raw key is ever available — the caller must save it now. The stored hash
    // is never returned.
    const { keyHash: _hash, ...safe } = row;
    return { ...safe, key: rawKey };
  }

  async revoke(id: string) {
    const existing = await this.tenantPrisma.client.apiKey.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('API key not found');
    const revoked = await this.tenantPrisma.client.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.audit?.log({
      entity: 'Integration',
      entityId: 'rest_api',
      action: 'integration.api_key_revoked',
      after: { name: existing.name, keyPrefix: existing.keyPrefix },
    });
    return revoked;
  }
}
