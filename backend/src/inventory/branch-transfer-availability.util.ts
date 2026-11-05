import { Prisma, StockTransferStatus } from '@prisma/client';

type TransferReader = Pick<Prisma.TransactionClient, 'stockTransfer' | 'product'>;

export interface ProductTransferInput {
  id: string;
  sku: string | null;
}

export interface BranchTransferAvailability {
  committedOutboundQty: number;
  incomingQty: number;
}

/**
 * Computes branch-transfer quantities affecting one business's active inventory products.
 * Pending/approved outbound transfers reserve source stock; only approved/shipped inbound
 * transfers count as committed supply. Inbound products are mapped by a unique active SKU, matching
 * the canonical stock-transfer destination lookup. Pending inbound requests are not commitments.
 */
export async function branchTransferAvailability(
  client: TransferReader,
  businessId: string,
  products: ProductTransferInput[],
): Promise<Map<string, BranchTransferAvailability>> {
  const productIds = new Set(products.map((product) => product.id));
  const rows = await client.stockTransfer.findMany({
    where: {
      OR: [{ sourceBusinessId: businessId }, { destBusinessId: businessId }],
      status: {
        in: [
          StockTransferStatus.pending,
          StockTransferStatus.approved,
          StockTransferStatus.shipped,
        ],
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      sourceBusinessId: true,
      destBusinessId: true,
      status: true,
      items: {
        orderBy: [{ id: 'asc' }],
        select: {
          sourceProductId: true,
          qty: true,
          receivedQty: true,
          sourceProduct: { select: { sku: true } },
        },
      },
    },
  });

  const inboundSkus = [
    ...new Set(
      rows.flatMap((transfer) =>
        transfer.destBusinessId === businessId &&
        (transfer.status === StockTransferStatus.approved ||
          transfer.status === StockTransferStatus.shipped)
          ? transfer.items
              .map((item) => item.sourceProduct.sku)
              .filter((sku): sku is string => Boolean(sku))
          : [],
      ),
    ),
  ];
  const destinationProducts = inboundSkus.length
    ? await client.product.findMany({
        where: { businessId, sku: { in: inboundSkus } },
        orderBy: [{ id: 'asc' }],
        select: { id: true, sku: true, active: true, kind: true },
      })
    : [];
  const productByUniqueSku = new Map<string, string>();
  const productsBySku = new Map<string, typeof destinationProducts>();
  for (const product of destinationProducts) {
    if (!product.sku) continue;
    const matches = productsBySku.get(product.sku) ?? [];
    matches.push(product);
    productsBySku.set(product.sku, matches);
  }
  for (const [sku, matches] of productsBySku) {
    if (
      matches.length === 1 &&
      matches[0].active &&
      matches[0].kind === 'product' &&
      productIds.has(matches[0].id)
    ) {
      productByUniqueSku.set(sku, matches[0].id);
    }
  }

  const result = new Map<string, BranchTransferAvailability>();
  const forProduct = (productId: string) => {
    const current = result.get(productId) ?? {
      committedOutboundQty: 0,
      incomingQty: 0,
    };
    result.set(productId, current);
    return current;
  };
  for (const transfer of rows) {
    for (const item of transfer.items) {
      if (
        transfer.sourceBusinessId === businessId &&
        productIds.has(item.sourceProductId) &&
        (transfer.status === StockTransferStatus.pending ||
          transfer.status === StockTransferStatus.approved)
      ) {
        forProduct(item.sourceProductId).committedOutboundQty += item.qty;
      }
      if (
        transfer.destBusinessId === businessId &&
        (transfer.status === StockTransferStatus.approved ||
          transfer.status === StockTransferStatus.shipped)
      ) {
        const destinationProductId = item.sourceProduct.sku
          ? productByUniqueSku.get(item.sourceProduct.sku)
          : undefined;
        if (!destinationProductId) continue;
        const outstanding = Math.max(0, item.qty - (item.receivedQty ?? 0));
        forProduct(destinationProductId).incomingQty += outstanding;
      }
    }
  }
  return result;
}
