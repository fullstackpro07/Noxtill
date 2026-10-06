import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProductKind } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { WEBSITE_ERRORS, WebsiteService, notFound } from './website.service';
import {
  StorefrontOptions,
  WebsiteContentError,
  normalizeStorefront,
  readStorefront,
} from './website-content.util';

export interface ProductSettingInput {
  visible?: boolean;
  sortPriority?: number;
  badge?: string | null;
  webTitle?: string | null;
  webSummary?: string | null;
}

/**
 * Storefront Configuration: how canonical products appear on the owned store. Price, stock and
 * the product record stay in Products/Inventory; this service only stores presentation.
 */
@Injectable()
export class WebsiteStorefrontService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly website: WebsiteService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async overview(businessId: string) {
    const site = await this.website.site(businessId);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const allowNegativeStock = resolvePolicies(business).bool(
      'sales.allowNegativeStock',
    );
    const [products, settings, collections] = await Promise.all([
      this.db.product.findMany({
        where: { businessId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          category: true,
          kind: true,
          sellingPrice: true,
          stockQty: true,
          active: true,
          sku: true,
        },
      }),
      this.db.websiteProductSetting.findMany({ where: { businessId } }),
      this.db.websiteCollection.findMany({
        where: { businessId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const byProduct = new Map(settings.map((s) => [s.productId, s]));
    const options = readStorefront(site.settings);
    const rows = products.map((p) => {
      const s = byProduct.get(p.id);
      const inStock =
        p.kind === ProductKind.service || p.stockQty > 0 || allowNegativeStock;
      const visible = s ? s.visible : true;
      const shownOnStore =
        p.active &&
        visible &&
        (inStock || options.outOfStockBehavior === 'show_unavailable');
      const issues: string[] = [];
      if (!p.active) issues.push('Inactive in Products');
      if (Number(p.sellingPrice) <= 0) issues.push('Price missing');
      if (!inStock) issues.push('Out of stock');
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        kind: p.kind,
        price: Number(p.sellingPrice),
        stockQty: p.kind === ProductKind.service ? null : p.stockQty,
        active: p.active,
        inStock,
        visible,
        shownOnStore,
        sortPriority: s?.sortPriority ?? 0,
        badge: s?.badge ?? null,
        webTitle: s?.webTitle ?? null,
        webSummary: s?.webSummary ?? null,
        issues,
      };
    });
    return {
      currency: business.currency,
      storeUrlPath: `/store/${business.slug}`,
      options,
      allowNegativeStock,
      kpis: {
        productsVisible: rows.filter((r) => r.shownOnStore).length,
        collections: collections.length,
        unavailableItems: rows.filter(
          (r) => r.active && r.visible && !r.inStock,
        ).length,
        catalogIssues: rows.filter(
          (r) => r.active && r.visible && r.issues.length > 0,
        ).length,
      },
      products: rows,
      collections: collections.map((c) => ({
        ...c,
        productIds: (c.productIds as string[]) ?? [],
      })),
    };
  }

  async updateProduct(
    businessId: string,
    actorUserId: string,
    productId: string,
    input: ProductSettingInput,
  ) {
    const product = await this.db.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true },
    });
    if (!product) notFound('Product');
    const data = this.settingData(input);
    const before = await this.db.websiteProductSetting.findFirst({
      where: { productId },
    });
    const saved = before
      ? await this.db.websiteProductSetting.update({
          where: { id: before.id },
          data,
        })
      : await this.db.websiteProductSetting.create({
          data: {
            ...(data as Prisma.WebsiteProductSettingUncheckedCreateInput),
            businessId,
            productId,
          },
        });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.storefront.product_changed',
      productId,
      before,
      saved,
    );
    return saved;
  }

  async bulkVisibility(
    businessId: string,
    actorUserId: string,
    productIds: string[],
    visible: boolean,
  ) {
    const ids = [...new Set(productIds)].slice(0, 500);
    const products = await this.db.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true },
    });
    if (products.length !== ids.length) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'Some products were not found.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.db.$transaction(async (tx) => {
      for (const id of ids) {
        const existing = await tx.websiteProductSetting.findFirst({
          where: { productId: id },
        });
        if (existing)
          await tx.websiteProductSetting.update({
            where: { id: existing.id },
            data: { visible },
          });
        else
          await tx.websiteProductSetting.create({
            data: { businessId, productId: id, visible },
          });
      }
      await this.website.audit(
        tx,
        businessId,
        actorUserId,
        'website.storefront.bulk_visibility',
        businessId,
        null,
        { productIds: ids, visible },
      );
    });
    return { updated: ids.length };
  }

  private settingData(input: ProductSettingInput) {
    const data: Prisma.WebsiteProductSettingUncheckedUpdateInput = {};
    const opt = (v: string | null | undefined, max: number, label: string) => {
      if (v === undefined) return undefined;
      const t = (v ?? '').trim();
      if (t.length > max)
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          `${label} is longer than ${max} characters.`,
          HttpStatus.BAD_REQUEST,
        );
      return t || null;
    };
    if (input.visible !== undefined) data.visible = input.visible;
    if (input.sortPriority !== undefined) {
      if (
        !Number.isInteger(input.sortPriority) ||
        input.sortPriority < -1000 ||
        input.sortPriority > 1000
      ) {
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          'Sort priority must be a whole number from -1000 to 1000.',
          HttpStatus.BAD_REQUEST,
        );
      }
      data.sortPriority = input.sortPriority;
    }
    if (input.badge !== undefined) data.badge = opt(input.badge, 40, 'Badge');
    if (input.webTitle !== undefined)
      data.webTitle = opt(input.webTitle, 200, 'Web title');
    if (input.webSummary !== undefined)
      data.webSummary = opt(input.webSummary, 500, 'Web summary');
    return data;
  }

  async saveOptions(businessId: string, actorUserId: string, input: unknown) {
    const site = await this.website.site(businessId);
    const current = readStorefront(site.settings);
    let next: StorefrontOptions;
    try {
      next = normalizeStorefront(input, current);
    } catch (error) {
      if (error instanceof WebsiteContentError)
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          error.message,
          HttpStatus.BAD_REQUEST,
        );
      throw error;
    }
    const stored = (
      site.settings && typeof site.settings === 'object' ? site.settings : {}
    ) as Record<string, unknown>;
    await this.db.websiteSite.update({
      where: { id: site.id },
      data: {
        settings: {
          ...stored,
          storefront: next,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.storefront.options_changed',
      site.id,
      current,
      next,
    );
    return next;
  }

  private async validProductIds(businessId: string, input: unknown) {
    if (
      !Array.isArray(input) ||
      input.length > 200 ||
      input.some((id) => typeof id !== 'string')
    ) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'A collection holds up to 200 product ids.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const ids = [...new Set(input as string[])];
    const found = await this.db.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        'A collection can only include products from this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return ids;
  }

  async saveCollection(
    businessId: string,
    actorUserId: string,
    id: string | null,
    input: {
      name?: string;
      productIds?: unknown;
      sortOrder?: number;
      visible?: boolean;
    },
  ) {
    const data: Prisma.WebsiteCollectionUncheckedUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 120)
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          'Collection name must be 1–120 characters.',
          HttpStatus.BAD_REQUEST,
        );
      data.name = name;
      data.slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 120) || 'collection';
    }
    if (input.productIds !== undefined)
      data.productIds = await this.validProductIds(
        businessId,
        input.productIds,
      );
    if (input.sortOrder !== undefined)
      data.sortOrder = Math.max(
        -1000,
        Math.min(1000, Math.trunc(input.sortOrder)),
      );
    if (input.visible !== undefined) data.visible = input.visible;
    try {
      if (id) {
        const existing = await this.db.websiteCollection.findFirst({
          where: { id, businessId },
        });
        if (!existing) notFound('Collection');
        const saved = await this.db.websiteCollection.update({
          where: { id },
          data,
        });
        await this.website.audit(
          this.db,
          businessId,
          actorUserId,
          'website.storefront.collection_changed',
          id,
          existing,
          saved,
        );
        return saved;
      }
      if (!data.name)
        throw new AppException(
          WEBSITE_ERRORS.INVALID,
          'Collection name is required.',
          HttpStatus.BAD_REQUEST,
        );
      const saved = await this.db.websiteCollection.create({
        data: {
          ...(data as Prisma.WebsiteCollectionUncheckedCreateInput),
          businessId,
        },
      });
      await this.website.audit(
        this.db,
        businessId,
        actorUserId,
        'website.storefront.collection_created',
        saved.id,
        null,
        saved,
      );
      return saved;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          WEBSITE_ERRORS.CONFLICT,
          'A collection with that name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async deleteCollection(businessId: string, actorUserId: string, id: string) {
    const existing = await this.db.websiteCollection.findFirst({
      where: { id, businessId },
    });
    if (!existing) notFound('Collection');
    const site = await this.website.site(businessId);
    const live = await this.website.liveSnapshot(site);
    const usedOn =
      live?.pages
        .filter((p) =>
          p.blocks.some((b) => b.type === 'products' && b.collectionId === id),
        )
        .map((p) => p.title) ?? [];
    if (usedOn.length) {
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        `Live page(s) show this collection: ${usedOn.join(', ')}. Change those pages first.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.db.websiteCollection.delete({ where: { id } });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.storefront.collection_deleted',
      id,
      existing,
      null,
    );
    return { deleted: true };
  }
}
