import { computeDeliveryPricing, haversineKm } from './delivery-pricing.util';

const hub = { hubLat: 31.5, hubLng: 74.35 };
const noCost = { costPerKm: null, riderPayPerDelivery: null };

describe('computeDeliveryPricing', () => {
  it('is null everywhere when there is no zone, no hub and no cost model — nothing is guessed', () => {
    const r = computeDeliveryPricing({
      zone: null,
      settings: { hubLat: null, hubLng: null, ...noCost },
      orderTotal: 1000,
      lat: 31.52,
      lng: 74.36,
    });
    expect(r).toEqual({ distanceKm: null, fee: null, cost: null });
  });

  it('flat zone fee needs no distance', () => {
    const r = computeDeliveryPricing({
      zone: {
        chargeType: 'flat',
        flatAmount: 250,
        perKmAmount: null,
        freeAboveOrderValue: null,
      },
      settings: { hubLat: null, hubLng: null, ...noCost },
      orderTotal: 1000,
      lat: null,
      lng: null,
    });
    expect(r.fee).toBe(250);
    expect(r.distanceKm).toBeNull();
  });

  it('by-distance fee is per-km × real distance from the hub, and null without coordinates', () => {
    const zone = {
      chargeType: 'by_distance' as const,
      flatAmount: null,
      perKmAmount: 50,
      freeAboveOrderValue: null,
    };
    const withCoords = computeDeliveryPricing({
      zone,
      settings: { ...hub, ...noCost },
      orderTotal: 1000,
      lat: 31.55,
      lng: 74.35,
    });
    const expectedKm = haversineKm(
      { lat: 31.5, lng: 74.35 },
      { lat: 31.55, lng: 74.35 },
    );
    expect(withCoords.distanceKm).toBeCloseTo(expectedKm, 1);
    expect(withCoords.fee).toBeCloseTo(50 * expectedKm, 0);

    const without = computeDeliveryPricing({
      zone,
      settings: { ...hub, ...noCost },
      orderTotal: 1000,
      lat: null,
      lng: null,
    });
    expect(without.fee).toBeNull();
  });

  it('free-above-order-value makes the fee zero', () => {
    const r = computeDeliveryPricing({
      zone: {
        chargeType: 'flat',
        flatAmount: 250,
        perKmAmount: null,
        freeAboveOrderValue: 5000,
      },
      settings: { hubLat: null, hubLng: null, ...noCost },
      orderTotal: 6000,
      lat: null,
      lng: null,
    });
    expect(r.fee).toBe(0);
  });

  it('cost = rider pay + round-trip fuel, and is null when fuel is configured but distance is unknown', () => {
    const zone = null;
    const full = computeDeliveryPricing({
      zone,
      settings: { ...hub, costPerKm: 10, riderPayPerDelivery: 100 },
      orderTotal: 0,
      lat: 31.55,
      lng: 74.35,
    });
    expect(full.cost).toBeCloseTo(100 + 10 * (full.distanceKm ?? 0) * 2, 1);

    const unknownDistance = computeDeliveryPricing({
      zone,
      settings: {
        hubLat: null,
        hubLng: null,
        costPerKm: 10,
        riderPayPerDelivery: 100,
      },
      orderTotal: 0,
      lat: null,
      lng: null,
    });
    expect(unknownDistance.cost).toBeNull();

    const payOnly = computeDeliveryPricing({
      zone,
      settings: {
        hubLat: null,
        hubLng: null,
        costPerKm: null,
        riderPayPerDelivery: 100,
      },
      orderTotal: 0,
      lat: null,
      lng: null,
    });
    expect(payOnly.cost).toBe(100);
  });
});
