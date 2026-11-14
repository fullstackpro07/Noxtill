import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
} as const;

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

  async list(businessId: string) {
    const disabled = new Set(await this.disabledFor(businessId));
    return {
      modules: BUSINESS_MODULES.map((module) => ({
        ...module,
        enabled: !disabled.has(module.key),
      })),
      disabled: [...disabled],
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
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ disabled_modules: unknown }>>`
        SELECT disabled_modules
        FROM businesses
        WHERE id = ${rootId}
        FOR UPDATE
      `;
      if (!rows[0]) {
        throw new AppException(
          'BUSINESS_NOT_FOUND',
          'The business module selection could not be found.',
          HttpStatus.NOT_FOUND,
        );
      }
      const current = new Set(parseDisabled(rows[0].disabled_modules));
      if (enabled) current.delete(key);
      else current.add(key);
      const disabled = [...current].sort();
      await tx.business.update({
        where: { id: rootId },
        data: { disabledModules: disabled },
      });
      return disabled;
    });
  }

  async setSelection(
    businessId: string,
    enabledKeys: string[],
    actorUserId?: string,
  ) {
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
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; disabled_modules: unknown }>
      >`
        SELECT id, disabled_modules
        FROM businesses
        WHERE id = ${rootId}
        FOR UPDATE
      `;
      if (!rows[0]) {
        throw new AppException(
          'BUSINESS_NOT_FOUND',
          'The business module selection could not be found.',
          HttpStatus.NOT_FOUND,
        );
      }
      const before = parseDisabled(rows[0].disabled_modules);
      if (
        before.length === disabled.length &&
        before.every((key, index) => key === disabled[index])
      ) {
        return;
      }
      await tx.business.update({
        where: { id: rootId },
        data: { disabledModules: disabled },
      });
      await tx.auditLog.create({
        data: {
          businessId: rootId,
          actorUserId: actorUserId ?? null,
          action: 'business_modules.selection_updated',
          entity: 'Business',
          entityId: rootId,
          before: { disabledModules: before },
          after: { disabledModules: disabled },
        },
      });
    });
    return disabled;
  }

  async assertEnabled(businessId: string, key: string): Promise<void> {
    const disabled = await this.disabledFor(businessId);
    if (!disabled.includes(key)) return;

    const label =
      BUSINESS_MODULES.find((module) => module.key === key)?.label ?? key;
    throw new AppException(
      BUSINESS_MODULE_ERROR_CODES.DISABLED,
      `${label} is turned off for this business.`,
      HttpStatus.FORBIDDEN,
    );
  }

  async assertEnabledInTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    keys: readonly string[],
  ): Promise<void> {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!business) {
      throw new AppException(
        'BUSINESS_NOT_FOUND',
        'The business module selection could not be confirmed.',
        HttpStatus.NOT_FOUND,
      );
    }

    // Module selection is stored on the root business. Lock that row so a
    // Settings update cannot disable a source between this check and the
    // caller's final persistence in the same transaction.
    const rootBusinessId = business.parentId ?? business.id;
    const rows = await tx.$queryRaw<Array<{ disabled_modules: unknown }>>`
      SELECT disabled_modules
      FROM businesses
      WHERE id = ${rootBusinessId}
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new AppException(
        'BUSINESS_NOT_FOUND',
        'The business module selection could not be confirmed.',
        HttpStatus.NOT_FOUND,
      );
    }

    const disabled = new Set(parseDisabled(rows[0].disabled_modules));
    for (const key of new Set(keys)) {
      if (!BUSINESS_MODULE_KEYS.has(key)) {
        throw new AppException(
          BUSINESS_MODULE_ERROR_CODES.UNKNOWN,
          'That module does not exist or cannot be turned off.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!disabled.has(key)) continue;
      const label =
        BUSINESS_MODULES.find((module) => module.key === key)?.label ?? key;
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.DISABLED,
        `${label} is turned off for this business.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async isEnabled(businessId: string, key: string): Promise<boolean> {
    const disabled = await this.disabledFor(businessId);
    return !disabled.includes(key);
  }
}
