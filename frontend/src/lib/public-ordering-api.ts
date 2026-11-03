import { apiFetch } from "@/lib/api-client";

export interface PublicOrderingProduct {
  id: string;
  name: string;
  category: string | null;
  sellingPrice: number;
  kind: "product" | "service";
  available: boolean;
}

export interface PublicOrderingMenu {
  business: {
    name: string;
    currency: string;
    locale: string;
    branding: unknown;
    acceptedPaymentMethods: string[];
    onlinePayment: {
      availability: "not_configured";
      detail: string;
    };
  };
  checkout: {
    deliveryAvailable: boolean;
    deliveryRequiresZone: boolean;
  };
  deliveryZones: Array<{
    id: string;
    name: string;
    fee: {
      chargeType: string;
      flatAmount: number | null;
      perKmAmount: number | null;
      freeAboveOrderValue: number | null;
    } | null;
  }>;
  products: PublicOrderingProduct[];
}

export interface PublicOrderInput {
  items: Array<{ productId: string; qty: number }>;
  orderType: "takeaway" | "delivery";
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  deliveryNote?: string;
}

export interface PublicOrderResult {
  id: string;
  orderNo: number;
  status: "pending";
  total: number;
  currency: string;
  paymentStatus: "unpaid";
}

export function fetchPublicOrderingMenu(slug: string) {
  return apiFetch<PublicOrderingMenu>(
    `/public/order/${encodeURIComponent(slug)}`,
    {},
    { skipAuth: true },
  );
}

export function createPublicOrder(
  slug: string,
  input: PublicOrderInput,
  idempotencyKey: string,
) {
  return apiFetch<PublicOrderResult>(
    `/public/order/${encodeURIComponent(slug)}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
    { skipAuth: true },
  );
}
