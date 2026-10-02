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
}
