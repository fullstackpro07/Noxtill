import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { CATEGORY_ERROR_CODES } from './categories.constants';
import { Prisma } from '@prisma/client';

interface CategoryRevenueRow {
  categoryId: string;
  categoryName: string;
  revenue: string | number;
}

/** Categories, formalized (UPD-BE-088). Replaces `Product.category`'s free-text field going
 * forward — new products should set `categoryId`; the old field stays for backward compatibility. */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.tenantPrisma.client.category.create({
        data: {
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
        } as Prisma.CategoryUncheckedCreateInput,
      });
    } catch (err) {
      throw this.mapDuplicateNameError(err, dto.name);
    }
  }

  async findAll() {
    const [categories, counts] = await Promise.all([
      this.tenantPrisma.client.category.findMany({
        orderBy: { sortOrder: 'asc' },
      }),
      this.tenantPrisma.client.product.groupBy({
        by: ['categoryId'],
        where: { categoryId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countByCategoryId = new Map(
      counts.map((c) => [c.categoryId as string, c._count._all]),
    );
    return categories.map((c) => ({
      ...c,
      productCount: countByCategoryId.get(c.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    const category = await this.tenantPrisma.client.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    try {
      return await this.tenantPrisma.client.category.update({
        where: { id },
        data: { name: dto.name, sortOrder: dto.sortOrder },
      });
    } catch (err) {
      throw this.mapDuplicateNameError(err, dto.name);
    }
  }

  /** Products keep their real row — only `categoryId` is cleared (the FK is `ON DELETE SET NULL`). */
  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.category.delete({ where: { id } });
  }

  /** Drag-reorder (UPD-FE-069) — writes every row's new `sortOrder` in one transaction. */
  async reorder(dto: ReorderCategoriesDto) {
    await this.tenantPrisma.client.$transaction(
      dto.categories.map((entry) =>
        this.tenantPrisma.client.category.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder },
        }),
      ),
    );
    return this.findAll();
  }

  /** Merges `id`'s products into `targetCategoryId`, then deletes `id` — the combined product
   * count under the target always equals the sum of both categories' counts beforehand. */
  async merge(id: string, targetCategoryId: string) {
    if (id === targetCategoryId) {
      throw new AppException(
        CATEGORY_ERROR_CODES.CANNOT_MERGE_INTO_SELF,
        'A category cannot be merged into itself',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.findOne(id);
    await this.findOne(targetCategoryId);

    const { count } = await this.tenantPrisma.client.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: targetCategoryId },
    });
    await this.tenantPrisma.client.category.delete({ where: { id } });

    return { mergedInto: targetCategoryId, movedProductCount: count };
  }

  /** Revenue-by-category donut (UPD-FE-069) — real revenue from completed sales' own OrderItem
   * rows, joined through each item's product to its category. Products with no category are
   * excluded, not lumped into a fake "Uncategorized" bucket that would overstate real coverage. */
  async revenueByCategory(): Promise<
    { categoryId: string; categoryName: string; revenue: number }[]
  > {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const rows = await this.tenantPrisma.client.$queryRaw<CategoryRevenueRow[]>`
      SELECT p.category_id AS categoryId, c.name AS categoryName, SUM(oi.price * oi.qty) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
        AND p.category_id IS NOT NULL
      GROUP BY p.category_id, c.name
      ORDER BY revenue DESC
    `;
    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      revenue: Number(r.revenue),
    }));
  }

  private mapDuplicateNameError(err: unknown, name?: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new AppException(
        CATEGORY_ERROR_CODES.NAME_TAKEN,
        `Category "${name}" already exists`,
        HttpStatus.CONFLICT,
      );
    }
    return err;
  }
}
