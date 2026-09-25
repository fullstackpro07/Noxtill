const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface PricingZone {
  chargeType: 'flat' | 'by_distance' | 'by_order_value';
  flatAmount: unknown;
  perKmAmount: unknown;
  freeAboveOrderValue: unknown;
}

export interface PricingSettings {
  hubLat: unknown;
  hubLng: unknown;
  costPerKm: unknown;
  riderPayPerDelivery: unknown;
}

export interface DeliveryPricing {
  distanceKm: number | null;
  fee: number | null;
  cost: number | null;
}

/**
 * The single place a delivery's fee, cost and distance are computed. Every figure is null when an
 * input it genuinely needs is missing (no zone, no coordinates, no dispatch hub, no configured
 * cost model) — never a guess. Cost treats fuel as a round trip (out and back) plus the fixed
 * rider pay per delivery, both straight from the owner's own settings.
 */
export function computeDeliveryPricing(input: {
  zone: PricingZone | null;
  settings: PricingSettings;
  orderTotal: number;
  lat: number | null;
  lng: number | null;
}): DeliveryPricing {
  const { zone, settings, orderTotal, lat, lng } = input;
  const hubLat = num(settings.hubLat);
  const hubLng = num(settings.hubLng);
  const distanceKm =
    hubLat !== null && hubLng !== null && lat !== null && lng !== null
      ? round2(haversineKm({ lat: hubLat, lng: hubLng }, { lat, lng }))
      : null;

  let fee: number | null = null;
  if (zone) {
    const freeAbove = num(zone.freeAboveOrderValue);
    if (freeAbove !== null && orderTotal >= freeAbove) {
      fee = 0;
    } else if (zone.chargeType === 'by_distance') {
      const perKm = num(zone.perKmAmount);
      fee =
        perKm !== null && distanceKm !== null
          ? round2(perKm * distanceKm)
          : null;
    } else {
      fee = num(zone.flatAmount);
    }
  }

  const perKmCost = num(settings.costPerKm);
  const riderPay = num(settings.riderPayPerDelivery);
  let cost: number | null = null;
  if (perKmCost !== null && distanceKm === null) {
    cost = null;
  } else if (perKmCost !== null || riderPay !== null) {
    cost = round2(
      (riderPay ?? 0) +
        (perKmCost !== null && distanceKm !== null
          ? perKmCost * distanceKm * 2
          : 0),
    );
  }

  return { distanceKm, fee, cost };
}
