import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BUSINESS_MODULE_KEYS,
  BUSINESS_MODULES,
} from './business-modules.constants';

export const BUSINESS_MODULE_ERROR_CODES = {
  UNKNOWN: 'BUSINESS_MODULE_UNKNOWN',
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
    const rootId = await this.rootOf(businessId);
    const root = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: { disabledModules: true },
    });
    return parseDisabled(root.disabledModules);
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
}
