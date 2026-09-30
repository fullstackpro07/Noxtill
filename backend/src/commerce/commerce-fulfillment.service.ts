import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceFulfillmentMappingRole,
  CommerceFulfillmentNodeStatus,
  CommerceFulfillmentNodeType,
  Prisma,
  ProductKind,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { COMMERCE_FULFILLMENT_ERROR_CODES as CODES } from './commerce.constants';
import type {
  CommerceFulfillmentNodeFieldsDto,
  CreateCommerceFulfillmentNodeDto,
  UpsertCommerceFulfillmentMappingDto,
} from './dto/commerce-fulfillment.dto';

/** Node types that are typically a supplier relationship; a supplier link is required for dropship. */
const SUPPLIER_TYPES = new Set<CommerceFulfillmentNodeType>([
  CommerceFulfillmentNodeType.dropship_supplier,
  CommerceFulfillmentNodeType.print_on_demand,
  CommerceFulfillmentNodeType.manufacturer,
]);

type NodeRow = Prisma.CommerceFulfillmentNodeGetPayload<object>;

interface NodeState {
  type: CommerceFulfillmentNodeType;
  branchBusinessId: string | null;
  supplierId: string | null;
}

function snapshot(node: NodeRow) {
  return {
    name: node.name,
    type: node.type,
    status: node.status,
    branchBusinessId: node.branchBusinessId,
    supplierId: node.supplierId,
    country: node.country,
    serviceMarkets: node.serviceMarkets,
    processingDays: node.processingDays,
    cutoffTime: node.cutoffTime,
    costPerOrder: node.costPerOrder === null ? null : Number(node.costPerOrder),
    dailyCapacity: node.dailyCapacity,
  } as Prisma.InputJsonValue;
}

function markets(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Fulfillment Network (Autonomous Commerce screen 7). Owns fulfilment nodes and product-to-node
 * mappings only: stock stays in Inventory (read by SKU from the linked branch), orders are routed
 * by the Fulfillment Router, and delivery execution belongs to Delivery & Riders.
 */
@Injectable()
export class CommerceFulfillmentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    /** Raw client for the one cross-branch read (branch group + branch stock), like RollupService. */
    private readonly prisma: PrismaService,
  ) {}

  private async branchGroup(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    const rootId = business.parentId ?? business.id;
    return this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true, name: true, active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertValidLinks(businessId: string, state: NodeState) {
    if (state.type === CommerceFulfillmentNodeType.own_location) {
      if (!state.branchBusinessId) {
        throw new AppException(
          CODES.INVALID_NODE,
          'Choose which of your branches this own location is.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (state.supplierId) {
        throw new AppException(
          CODES.INVALID_NODE,
          'An own location is one of your branches, not a supplier.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const group = await this.branchGroup(businessId);
      if (!group.some((branch) => branch.id === state.branchBusinessId)) {
        throw new AppException(
          CODES.BRANCH_NOT_IN_GROUP,
          'That branch does not belong to this business group.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    if (state.branchBusinessId) {
      throw new AppException(
        CODES.INVALID_NODE,
        'Only own-location nodes can be linked to a branch.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      state.type === CommerceFulfillmentNodeType.dropship_supplier &&
      !state.supplierId
    ) {
      throw new AppException(
        CODES.INVALID_NODE,
        'Choose the supplier that ships dropship orders.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (state.supplierId) {
      if (!SUPPLIER_TYPES.has(state.type)) {
        throw new AppException(
          CODES.INVALID_NODE,
          'Only dropship, print-on-demand and manufacturer nodes can link a supplier.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const supplier = await this.tenantPrisma.client.supplier.findFirst({
        where: { id: state.supplierId, businessId },
        select: { id: true },
      });
      if (!supplier) {
        throw new AppException(
          CODES.SUPPLIER_NOT_FOUND,
          'Supplier was not found in Products → Suppliers.',
          HttpStatus.NOT_FOUND,
        );
      }
    }
  }

  private fields(dto: CommerceFulfillmentNodeFieldsDto) {
    const data: Prisma.CommerceFulfillmentNodeUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.branchBusinessId !== undefined)
      data.branchBusinessId = dto.branchBusinessId || null;
    if (dto.supplierId !== undefined) data.supplierId = dto.supplierId || null;
    if (dto.country !== undefined)
      data.country = dto.country ? dto.country.toUpperCase() : null;
    if (dto.serviceMarkets !== undefined)
      data.serviceMarkets = [
        ...new Set(dto.serviceMarkets.map((code) => code.toUpperCase())),
      ];
    if (dto.processingDays !== undefined)
      data.processingDays = dto.processingDays;
    if (dto.cutoffTime !== undefined) data.cutoffTime = dto.cutoffTime || null;
    if (dto.costPerOrder !== undefined) data.costPerOrder = dto.costPerOrder;
    if (dto.dailyCapacity !== undefined) data.dailyCapacity = dto.dailyCapacity;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    return data;
  }

  private async findNode(businessId: string, id: string) {
    const node =
      await this.tenantPrisma.client.commerceFulfillmentNode.findFirst({
        where: { id, businessId },
      });
    if (!node) {
      throw new AppException(
        CODES.NODE_NOT_FOUND,
        'Fulfilment node was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return node;
  }

  /** Nodes with mapping counts and, for own locations, real branch stock of mapped products. */
  async listNodes(businessId: string) {
    const [nodes, group] = await Promise.all([
      this.tenantPrisma.client.commerceFulfillmentNode.findMany({
        where: { businessId },
        include: {
          supplier: { select: { id: true, name: true } },
          mappings: {
            select: {
              role: true,
              product: { select: { sku: true, active: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.branchGroup(businessId),
    ]);
    const branchNames = new Map(group.map((branch) => [branch.id, branch]));

    return Promise.all(
      nodes.map(async (node) => {
        const primaryCount = node.mappings.filter(
          (mapping) => mapping.role === CommerceFulfillmentMappingRole.primary,
        ).length;
        let stock: {
          tracked: boolean;
          units: number | null;
          skusMatched: number;
          skusMissing: number;
        } = { tracked: false, units: null, skusMatched: 0, skusMissing: 0 };
        if (
          node.type === CommerceFulfillmentNodeType.own_location &&
          node.branchBusinessId
        ) {
          const skus = [
            ...new Set(
              node.mappings.flatMap((mapping) =>
                mapping.product.sku?.trim() ? [mapping.product.sku.trim()] : [],
              ),
            ),
          ];
          // Branches don't share product identity: match the mapped products by SKU in the branch.
          const branchProducts = skus.length
            ? await this.prisma.product.findMany({
                where: {
                  businessId: node.branchBusinessId,
                  sku: { in: skus },
                },
                select: { sku: true, stockQty: true },
              })
            : [];
          const matched = new Set(branchProducts.map((product) => product.sku));
          stock = {
            tracked: true,
            units: branchProducts.reduce(
              (sum, product) => sum + Math.max(product.stockQty, 0),
              0,
            ),
            skusMatched: matched.size,
            skusMissing:
              node.mappings.length -
              node.mappings.filter(
                (mapping) =>
                  mapping.product.sku &&
                  matched.has(mapping.product.sku.trim()),
              ).length,
          };
        }
        const branch = node.branchBusinessId
          ? branchNames.get(node.branchBusinessId)
          : undefined;
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          status: node.status,
          disabledReason: node.disabledReason,
          branch: node.branchBusinessId
            ? {
                id: node.branchBusinessId,
                name: branch?.name ?? null,
                active: branch?.active ?? false,
              }
            : null,
          supplier: node.supplier,
          country: node.country,
          serviceMarkets: markets(node.serviceMarkets),
          processingDays: node.processingDays,
          cutoffTime: node.cutoffTime,
          costPerOrder:
            node.costPerOrder === null ? null : Number(node.costPerOrder),
          dailyCapacity: node.dailyCapacity,
          notes: node.notes,
          mappedProducts: node.mappings.length,
          primaryFor: primaryCount,
          backupFor: node.mappings.length - primaryCount,
          stock,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        };
      }),
    );
  }

  /** Branches of this business group, for choosing an own-location node. */
  async branches(businessId: string) {
    return this.branchGroup(businessId);
  }

  async createNode(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceFulfillmentNodeDto,
  ) {
    const data = this.fields(dto);
    await this.assertValidLinks(businessId, {
      type: dto.type,
      branchBusinessId: (data.branchBusinessId as string | null) ?? null,
      supplierId: (data.supplierId as string | null) ?? null,
    });
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        const node = await tx.commerceFulfillmentNode.create({
          data: {
            ...(data as Prisma.CommerceFulfillmentNodeUncheckedCreateInput),
            name: dto.name.trim(),
            type: dto.type,
            businessId,
            createdByUserId: actorUserId,
          },
        });
        await tx.commerceFulfillmentAudit.create({
          data: {
            businessId,
            nodeId: node.id,
            action: 'node_created',
            actorUserId,
            after: snapshot(node),
          },
        });
        return node;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NODE_NAME_TAKEN,
          'A fulfilment node with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updateNode(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceFulfillmentNodeFieldsDto,
  ) {
    const existing = await this.findNode(businessId, id);
    const data = this.fields(dto);
    await this.assertValidLinks(businessId, {
      type: existing.type,
      branchBusinessId:
        data.branchBusinessId !== undefined
          ? (data.branchBusinessId as string | null)
          : existing.branchBusinessId,
      supplierId:
        data.supplierId !== undefined
          ? (data.supplierId as string | null)
          : existing.supplierId,
    });
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        const node = await tx.commerceFulfillmentNode.update({
          where: { id, businessId },
          data,
        });
        await tx.commerceFulfillmentAudit.create({
          data: {
            businessId,
            nodeId: id,
            action: 'node_updated',
            actorUserId,
            before: snapshot(existing),
            after: snapshot(node),
          },
        });
        return node;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NODE_NAME_TAKEN,
          'A fulfilment node with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async setNodeStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceFulfillmentNodeStatus,
    reason?: string,
  ) {
    const existing = await this.findNode(businessId, id);
    if (existing.status === status) return existing;
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const node = await tx.commerceFulfillmentNode.update({
        where: { id, businessId },
        data: {
          status,
          disabledReason:
            status === CommerceFulfillmentNodeStatus.disabled
              ? (reason?.trim() ?? null)
              : null,
        },
      });
      await tx.commerceFulfillmentAudit.create({
        data: {
          businessId,
          nodeId: id,
          action:
            status === CommerceFulfillmentNodeStatus.disabled
              ? 'node_disabled'
              : 'node_enabled',
          reason: reason?.trim() || null,
          actorUserId,
          before: snapshot(existing),
          after: snapshot(node),
        },
      });
      return node;
    });
  }

  /**
   * Coverage of active physical products. Only active nodes count: a product whose only mapping is
   * a disabled node is a coverage gap, and a primary on a disabled node is reported separately.
   */
  async coverage(businessId: string) {
    const products = await this.tenantPrisma.client.product.findMany({
      where: { businessId, active: true, kind: ProductKind.product },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQty: true,
        fulfillmentMappings: {
          select: {
            id: true,
            role: true,
            priority: true,
            node: {
              select: { id: true, name: true, type: true, status: true },
            },
          },
          orderBy: [{ role: 'asc' }, { priority: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
    const rows = products.map((product) => {
      const active = product.fulfillmentMappings.filter(
        (mapping) =>
          mapping.node.status === CommerceFulfillmentNodeStatus.active,
      );
      const primary = product.fulfillmentMappings.find(
        (mapping) => mapping.role === CommerceFulfillmentMappingRole.primary,
      );
      const activeBackups = active.filter(
        (mapping) => mapping.role === CommerceFulfillmentMappingRole.backup,
      ).length;
      const primaryActive =
        primary?.node.status === CommerceFulfillmentNodeStatus.active;
      const coverage =
        active.length === 0
          ? 'gap'
          : !primaryActive
            ? 'primary_unavailable'
            : activeBackups === 0
              ? 'no_backup'
              : 'covered';
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        stockQty: product.stockQty,
        coverage,
        mappings: product.fulfillmentMappings.map((mapping) => ({
          id: mapping.id,
          role: mapping.role,
          priority: mapping.priority,
          node: mapping.node,
        })),
      };
    });
    const count = (value: string) =>
      rows.filter((row) => row.coverage === value).length;
    return {
      summary: {
        activeProducts: rows.length,
        covered: count('covered'),
        noBackup: count('no_backup'),
        primaryUnavailable: count('primary_unavailable'),
        gaps: count('gap'),
      },
      products: rows,
    };
  }

  async upsertMapping(
    businessId: string,
    actorUserId: string,
    dto: UpsertCommerceFulfillmentMappingDto,
  ) {
    const node = await this.findNode(businessId, dto.nodeId);
    if (node.status === CommerceFulfillmentNodeStatus.disabled) {
      throw new AppException(
        CODES.NODE_DISABLED,
        'Enable this node before mapping products to it.',
        HttpStatus.CONFLICT,
      );
    }
    const product = await this.tenantPrisma.client.product.findFirst({
      where: {
        id: dto.productId,
        businessId,
        active: true,
        kind: ProductKind.product,
      },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Only active physical products from Products can be mapped.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.tenantPrisma.client.$transaction(async (tx) => {
      // One primary per product: promoting this node demotes the previous primary to a backup.
      const demoted =
        dto.role === CommerceFulfillmentMappingRole.primary
          ? await tx.commerceFulfillmentMapping.findMany({
              where: {
                businessId,
                productId: dto.productId,
                role: CommerceFulfillmentMappingRole.primary,
                nodeId: { not: dto.nodeId },
              },
              select: { id: true, nodeId: true },
            })
          : [];
      if (demoted.length) {
        await tx.commerceFulfillmentMapping.updateMany({
          where: { businessId, id: { in: demoted.map((row) => row.id) } },
          data: { role: CommerceFulfillmentMappingRole.backup },
        });
      }
      const mapping = await tx.commerceFulfillmentMapping.upsert({
        where: {
          businessId_nodeId_productId: {
            businessId,
            nodeId: dto.nodeId,
            productId: dto.productId,
          },
        },
        create: {
          businessId,
          nodeId: dto.nodeId,
          productId: dto.productId,
          role: dto.role,
          priority: dto.priority ?? 1,
        },
        update: { role: dto.role, priority: dto.priority ?? 1 },
      });
      await tx.commerceFulfillmentAudit.create({
        data: {
          businessId,
          nodeId: dto.nodeId,
          action: 'mapping_set',
          actorUserId,
          after: {
            productId: dto.productId,
            role: dto.role,
            priority: mapping.priority,
            demotedPrimaryNodeIds: demoted.map((row) => row.nodeId),
          } as Prisma.InputJsonValue,
        },
      });
      return mapping;
    });
  }

  async removeMapping(businessId: string, actorUserId: string, id: string) {
    const mapping =
      await this.tenantPrisma.client.commerceFulfillmentMapping.findFirst({
        where: { id, businessId },
      });
    if (!mapping) {
      throw new AppException(
        CODES.MAPPING_NOT_FOUND,
        'Product mapping was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.commerceFulfillmentMapping.delete({
        where: { id, businessId },
      });
      await tx.commerceFulfillmentAudit.create({
        data: {
          businessId,
          nodeId: mapping.nodeId,
          action: 'mapping_removed',
          actorUserId,
          before: {
            productId: mapping.productId,
            role: mapping.role,
            priority: mapping.priority,
          } as Prisma.InputJsonValue,
        },
      });
    });
    return { removed: true };
  }

  async audit(businessId: string, nodeId?: string) {
    return this.tenantPrisma.client.commerceFulfillmentAudit.findMany({
      where: { businessId, ...(nodeId ? { nodeId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }
}
