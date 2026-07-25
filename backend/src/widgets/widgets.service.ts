import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { findWidget, WIDGET_REGISTRY } from './widget-registry';
import { WIDGET_CACHE_TTL_MS, WIDGET_ERROR_CODES } from './widgets.constants';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Widget registry service (BE-067). `getWidgetData` caches per
 * (businessId, key) for WIDGET_CACHE_TTL_MS — a plain in-process Map is
 * enough here since widget payloads are cheap-but-not-free aggregates and
 * don't need cross-instance consistency (a stale-by-at-most-60s read is
 * the whole point of the cache).
 */
@Injectable()
export class WidgetsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  listRegistry() {
    return WIDGET_REGISTRY.map((w) => ({
      key: w.key,
      title: w.title,
      category: w.category,
    }));
  }

  async getWidgetData(key: string): Promise<unknown> {
    const widget = findWidget(key);
    if (!widget) {
      throw new AppException(
        WIDGET_ERROR_CODES.WIDGET_NOT_FOUND,
        `Unknown widget: ${key}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const cacheKey = `${businessId}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await widget.resolve({
      businessId,
      tenantPrisma: this.tenantPrisma,
    });
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + WIDGET_CACHE_TTL_MS,
    });
    return value;
  }
}
