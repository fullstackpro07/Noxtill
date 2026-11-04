import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { PoliciesService } from '../common/policies/policies.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, Prisma, ProductKind } from '@prisma/client';

export interface ProductQuery {
  q?: string;
  category?: string;
  categoryId?: string;
  kind?: ProductKind;
  active?: boolean;
}

const PRODUCT_ERROR_CODES = {
  DUPLICATE_SKU: 'DUPLICATE_SKU',
} as const;

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PurchasePackInput {
  kind: ProductKind;
  stockUnitLabel: string | null | undefined;
  purchaseUnitLabel: string | null | undefined;
  purchasePackSize: number | null | undefined;
}

function normalizePurchasePack(input: PurchasePackInput) {
  const stockUnitLabel = input.stockUnitLabel?.trim() || null;
  const purchaseUnitLabel = input.purchaseUnitLabel?.trim() || null;
  const purchasePackSize = input.purchasePackSize ?? null;
  const configured =
    stockUnitLabel !== null ||
    purchaseUnitLabel !== null ||
    purchasePackSize !== null;

  if (!configured) {
    return {
      stockUnitLabel: null,
      purchaseUnitLabel: null,
      purchasePackSize: null,
    };
  }

  if (input.kind !== ProductKind.product) {
    throw new AppException(
      'PRODUCT_PURCHASE_PACK_PRODUCT_ONLY',
      'Purchase pack settings can only be used for products.',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (
    !stockUnitLabel ||
    !purchaseUnitLabel ||
    !Number.isInteger(purchasePackSize) ||
    purchasePackSize === null ||
    purchasePackSize < 2
  ) {
    throw new AppException(
      'PRODUCT_PURCHASE_PACK_INCOMPLETE',
      'Set the stock unit, purchase unit and an integer pack size of at least 2, or clear all three.',
      HttpStatus.BAD_REQUEST,
    );
  }

  return { stockUnitLabel, purchaseUnitLabel, purchasePackSize };
}

function normalizeMinimumReorderQty(
  kind: ProductKind,
  value: number | null | undefined,
) {
  const minimumReorderQty = value ?? null;
  if (minimumReorderQty === null) return null;
  if (kind !== ProductKind.product) {
    throw new AppException(
      'PRODUCT_MINIMUM_REORDER_PRODUCT_ONLY',
      'Minimum reorder quantity can only be used for products.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (!Number.isInteger(minimumReorderQty) || minimumReorderQty < 1) {
    throw new AppException(
      'PRODUCT_MINIMUM_REORDER_INVALID',
      'Minimum reorder quantity must be a whole number of at least 1 stock unit.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return minimumReorderQty;
}

/** Products CRUD (BE-023). All queries go through TenantPrismaService, so business_id scoping is automatic. */
@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly policies: PoliciesService,
  ) {}

  /** `photoKey` is an S3/local-disk object key, never a raw URL — resolved to a fresh signed URL
   * lazily on read, same convention as `Expense.receiptKey`. */
  private async withPhotoUrl<T extends Product>(
    product: T,
  ): Promise<T & { photoUrl: string | null }> {
    return {
      ...product,
      photoUrl: product.photoKey
        ? await this.s3.getSignedDownloadUrl(product.photoKey)
        : null,
    };
  }

  async create(dto: CreateProductDto) {
    try {
      const purchasePack = normalizePurchasePack({
        kind: dto.kind,
        stockUnitLabel: dto.stockUnitLabel,
        purchaseUnitLabel: dto.purchaseUnitLabel,
        purchasePackSize: dto.purchasePackSize,
      });
      const minimumReorderQty = normalizeMinimumReorderQty(
        dto.kind,
        dto.minimumReorderQty,
      );
      const product = await this.tenantPrisma.client.product.create({
        data: {
          kind: dto.kind,
          name: dto.name,
          category: dto.category,
          categoryId: dto.categoryId,
          sku: dto.sku,
          variations: (dto.variations ??
            []) as unknown as Prisma.InputJsonValue,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: dto.stockQty ?? 0,
          lowStockThreshold:
            dto.lowStockThreshold ??
            (await this.policies.current()).num('catalog.defaultLowStockThreshold') ??
            5,
          ...purchasePack,
          minimumReorderQty,
          durationMin: dto.kind === 'service' ? dto.durationMin : undefined,
          active: dto.active ?? true,
          // Needed for the outer `as Prisma.ProductUncheckedCreateInput` cast below to type-check —
          // ESLint's per-expression check disagrees with tsc's whole-object-literal overlap check.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          eligibleStaffIds: (dto.eligibleStaffIds ??
            []) as unknown as Prisma.InputJsonValue,
          bufferBeforeMin: dto.bufferBeforeMin,
          bufferAfterMin: dto.bufferAfterMin,
          depositRequired: dto.depositRequired ?? false,
          depositAmount: dto.depositAmount,
        } as Prisma.ProductUncheckedCreateInput,
      });
      return this.withPhotoUrl(product);
    } catch (err) {
      throw this.mapDuplicateSkuError(err, dto.sku);
    }
  }

  async findAll(query: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      kind: query.kind,
      category: query.category,
      categoryId: query.categoryId,
      active: query.active,
      OR: query.q
        ? [{ name: { contains: query.q } }, { sku: { contains: query.q } }]
        : undefined,
    };

    const products = await this.tenantPrisma.client.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return Promise.all(products.map((p) => this.withPhotoUrl(p)));
  }

  private async findRaw(id: string): Promise<Product> {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findOne(id: string) {
    return this.withPhotoUrl(await this.findRaw(id));
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findRaw(id);
    try {
      const serviceKindClearsPack =
        dto.kind === ProductKind.service &&
        (current.stockUnitLabel !== null ||
          current.purchaseUnitLabel !== null ||
          current.purchasePackSize !== null) &&
        dto.stockUnitLabel === undefined &&
        dto.purchaseUnitLabel === undefined &&
        dto.purchasePackSize === undefined;
      const purchasePackChanged =
        serviceKindClearsPack ||
        dto.stockUnitLabel !== undefined ||
        dto.purchaseUnitLabel !== undefined ||
        dto.purchasePackSize !== undefined;
      const purchasePack = purchasePackChanged
        ? serviceKindClearsPack
          ? {
              stockUnitLabel: null,
              purchaseUnitLabel: null,
              purchasePackSize: null,
            }
          : normalizePurchasePack({
            kind: dto.kind ?? current.kind,
            stockUnitLabel:
              dto.stockUnitLabel !== undefined
                ? dto.stockUnitLabel
                : current.stockUnitLabel,
            purchaseUnitLabel:
              dto.purchaseUnitLabel !== undefined
                ? dto.purchaseUnitLabel
                : current.purchaseUnitLabel,
            purchasePackSize:
              dto.purchasePackSize !== undefined
                ? dto.purchasePackSize
                : current.purchasePackSize,
            })
        : undefined;
      const serviceKindClearsMinimumReorder =
        dto.kind === ProductKind.service &&
        current.minimumReorderQty !== null &&
        dto.minimumReorderQty === undefined;
      const minimumReorderQty =
        dto.minimumReorderQty !== undefined || serviceKindClearsMinimumReorder
          ? serviceKindClearsMinimumReorder
            ? null
            : normalizeMinimumReorderQty(
                dto.kind ?? current.kind,
                dto.minimumReorderQty,
              )
          : undefined;
      const product = await this.tenantPrisma.client.product.update({
        where: { id },
        data: {
          kind: dto.kind,
          name: dto.name,
          category: dto.category,
          categoryId: dto.categoryId,
          sku: dto.sku,
          variations: dto.variations
            ? (dto.variations as unknown as Prisma.InputJsonValue)
            : undefined,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: dto.stockQty,
          lowStockThreshold: dto.lowStockThreshold,
          ...(purchasePack ?? {}),
          minimumReorderQty,
          durationMin: dto.durationMin,
          active: dto.active,
          eligibleStaffIds: dto.eligibleStaffIds
            ? (dto.eligibleStaffIds as unknown as Prisma.InputJsonValue)
            : undefined,
          bufferBeforeMin: dto.bufferBeforeMin,
          bufferAfterMin: dto.bufferAfterMin,
          depositRequired: dto.depositRequired,
          depositAmount: dto.depositAmount,
        },
      });
      return this.withPhotoUrl(product);
    } catch (err) {
      throw this.mapDuplicateSkuError(err, dto.sku);
    }
  }

  async deactivate(id: string) {
    await this.findRaw(id);
    const product = await this.tenantPrisma.client.product.update({
      where: { id },
      data: { active: false },
    });
    return this.withPhotoUrl(product);
  }

  /** Uploads (or replaces) this product's photo — deletes the previous S3/local-disk object first
   * so photos never leak as orphaned storage. */
  async uploadPhoto(
    id: string,
    file: { buffer: Buffer; size: number; mimetype: string },
  ) {
    const product = await this.findRaw(id);
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_PHOTO_MIME_TYPES,
      maxSizeBytes: MAX_PHOTO_SIZE_BYTES,
    });

    if (product.photoKey) {
      await this.s3.delete(product.photoKey);
    }

    const ext = file.mimetype.split('/')[1] ?? 'bin';
    const key = `products/${product.businessId}/${id}/${randomUUID()}.${ext}`;
    await this.s3.upload(key, file.buffer, file.mimetype);

    const updated = await this.tenantPrisma.client.product.update({
      where: { id },
      data: { photoKey: key },
    });
    return this.withPhotoUrl(updated);
  }

  async removePhoto(id: string) {
    const product = await this.findRaw(id);
    if (product.photoKey) {
      await this.s3.delete(product.photoKey);
    }
    const updated = await this.tenantPrisma.client.product.update({
      where: { id },
      data: { photoKey: null },
    });
    return this.withPhotoUrl(updated);
  }

  /** Prisma's raw P2002 on the (businessId, sku) unique index reads as an opaque 500 to the client otherwise. */
  private mapDuplicateSkuError(err: unknown, sku: string | undefined): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      (err.meta?.target as string[] | undefined)?.includes('sku')
    ) {
      return new AppException(
        PRODUCT_ERROR_CODES.DUPLICATE_SKU,
        `A product with sku "${sku}" already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return err;
  }
}
