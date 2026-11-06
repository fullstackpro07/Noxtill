import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BUSINESS_MODULE_KEYS,
  BUSINESS_MODULES,
} from './business-modules.constants';

export const BUSINESS_MODULE_ERROR_CODES = {
  UNKNOWN: 'BUSINESS_MODULE_UNKNOWN',
  DISABLED: 'BUSINESS_MODULE_DISABLED',
  OWNER_REQUIRED: 'BUSINESS_MODULE_OWNER_REQUIRED',
  PLATFORM_BLOCKED: 'BUSINESS_MODULE_PLATFORM_BLOCKED',
  READ_ONLY: 'BUSINESS_MODULE_READ_ONLY',
} as const;

/** A Noxtill (Super Admin) decision about one module — global, or for this business only. */
export interface PlatformModuleBlock {
  state: 'global_disabled' | 'suspended' | 'restricted';
  reason: string | null;
  expiresAt: string | null;
}

const PLATFORM_CACHE_MS = 10_000;
const platformCache = new Map<
  string,
  { at: number; blocks: Record<string, PlatformModuleBlock> }
>();

/** Called by Super Admin module changes so they apply on the very next request. */
export function invalidatePlatformModuleCache(): void {
  platformCache.clear();
}

/** Known keys only — a stale key from a removed module is ignored, never trusted. */
export function parseDisabled(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (key): key is string =>
          typeof key === 'string' && BUSINESS_MODULE_KEYS.has(key),
      ),
    ),
  ].sort();
}

/**
 * Module selection per business. The choice lives on the root business so every branch shows the
 * same modules. Uses PrismaService with an explicit business id because a branch user resolves
 * to the root (parent) business, which tenant scoping would hide.
 */
@Injectable()
export class BusinessModulesService {
  constructor(private readonly prisma: PrismaService) {}

  private async rootOf(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    return business.parentId ?? business.id;
  }

  async disabledFor(businessId: string): Promise<string[]> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = business.parentId
      ? business.parent?.disabledModules
      : business.disabledModules;
    return parseDisabled(disabled);
  }

  /**
   * Super Admin module decisions in force for this business: a global disable (every business),
   * or a per-business `suspended` / `restricted` (read-only) override that is not revoked or
   * expired. Global wins over per-business; suspended wins over restricted.
   */
  async platformBlocks(
    businessId: string,
  ): Promise<Record<string, PlatformModuleBlock>> {
    const rootId = await this.rootOf(businessId);
    const hit = platformCache.get(rootId);
    if (hit && Date.now() - hit.at < PLATFORM_CACHE_MS) return hit.blocks;
    const now = new Date();
    const [global, overrides] = await Promise.all([
      this.prisma.platformModuleState.findMany({
        where: { globallyDisabled: true },
      }),
      this.prisma.moduleAccessOverride.findMany({
        where: {
          businessId: rootId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);
    const blocks: Record<string, PlatformModuleBlock> = {};
    for (const o of overrides) {
      const prev = blocks[o.moduleKey];
      if (prev && (prev.state === 'suspended' || o.state !== 'suspended'))
        continue;
      blocks[o.moduleKey] = {
        state: o.state === 'suspended' ? 'suspended' : 'restricted',
        reason: o.reason,
        expiresAt: o.expiresAt?.toISOString() ?? null,
      };
    }
    for (const g of global) {
      blocks[g.moduleKey] = {
        state: 'global_disabled',
        reason: g.reason,
        expiresAt: null,
      };
    }
    platformCache.set(rootId, { at: Date.now(), blocks });
    return blocks;
  }

  /**
   * `disabled` = what the sidebar hides: the owner's own choice plus anything Noxtill has turned
   * off (global or suspended). A `restricted` module stays visible but is read-only.
   * `enabled` per module stays the owner's own choice; `platform` says what Noxtill decided.
   */
  async list(businessId: string) {
    const [ownerDisabled, platform] = await Promise.all([
      this.disabledFor(businessId),
      this.platformBlocks(businessId),
    ]);
    const owner = new Set(ownerDisabled);
    const hidden = new Set(owner);
    for (const [key, block] of Object.entries(platform)) {
      if (block.state !== 'restricted' && BUSINESS_MODULE_KEYS.has(key))
        hidden.add(key);
    }
    return {
      modules: BUSINESS_MODULES.map((module) => ({
        ...module,
        enabled: !owner.has(module.key),
        platform: platform[module.key] ?? null,
      })),
      disabled: [...hidden].sort(),
      platform,
    };
  }

  async setEnabled(businessId: string, key: string, enabled: boolean) {
    if (!BUSINESS_MODULE_KEYS.has(key)) {
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.UNKNOWN,
        'That module does not exist or cannot be turned off.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rootId = await this.rootOf(businessId);
    const current = new Set(await this.disabledFor(rootId));
    if (enabled) current.delete(key);
    else current.add(key);
    await this.prisma.business.update({
      where: { id: rootId },
      data: { disabledModules: [...current].sort() },
    });
    return [...current].sort();
  }

  async setSelection(businessId: string, enabledKeys: string[]) {
    const unknown = enabledKeys.filter((key) => !BUSINESS_MODULE_KEYS.has(key));
    if (unknown.length > 0) {
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.UNKNOWN,
        'One or more selected modules do not exist.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const enabled = new Set(enabledKeys);
    const disabled = BUSINESS_MODULES.filter(
      (module) => !enabled.has(module.key),
    )
      .map((module) => module.key)
      .sort();
    const rootId = await this.rootOf(businessId);
    await this.prisma.business.update({
      where: { id: rootId },
      data: { disabledModules: disabled },
    });
    return disabled;
  }

  async assertEnabled(
    businessId: string,
    key: string,
    method = 'GET',
  ): Promise<void> {
    const label =
      BUSINESS_MODULES.find((module) => module.key === key)?.label ?? key;
    const block = (await this.platformBlocks(businessId))[key];
    if (block && block.state !== 'restricted') {
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.PLATFORM_BLOCKED,
        block.state === 'global_disabled'
          ? `${label} is temporarily unavailable on Noxtill.`
          : `${label} has been suspended for this business by Noxtill. Contact Noxtill support.`,
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      block?.state === 'restricted' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
    ) {
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.READ_ONLY,
        `${label} is read-only for this business (set by Noxtill). You can view and export, but not make changes.`,
        HttpStatus.FORBIDDEN,
      );
    }

    const disabled = await this.disabledFor(businessId);
    if (!disabled.includes(key)) return;

    throw new AppException(
      BUSINESS_MODULE_ERROR_CODES.DISABLED,
      `${label} is turned off for this business.`,
      HttpStatus.FORBIDDEN,
    );
  }
}
