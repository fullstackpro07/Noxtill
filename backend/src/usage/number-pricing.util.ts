/**
 * Phone-number pricing rule (pricing page spec C3). The customer price is derived from the
 * provider's wholesale monthly price for that country and number type, never from a hard-coded
 * country table:
 *
 *   wholesale < $1.35          -> $4.00 floor
 *   $1.35 - $10.00             -> wholesale x 3, rounded up to the next whole dollar
 *   wholesale > $10.00         -> wholesale x 2, rounded up to the next whole dollar
 *
 * The result is never below the floor, and never below cost in an expensive market.
 */
export const NUMBER_PRICE_FLOOR_USD = 4;
export const NUMBER_PRICE_LOW_BAND_MAX_USD = 1.35;
export const NUMBER_PRICE_MID_BAND_MAX_USD = 10;

const ceilDollar = (value: number): number =>
  // Round to micro-dollars first so 1.2 * 3 = 3.5999999… does not misbehave at band edges.
  Math.ceil(Math.round(value * 1e6) / 1e6);

export function customerNumberPriceUsd(wholesaleUsd: number): number {
  if (!Number.isFinite(wholesaleUsd) || wholesaleUsd < 0) {
    throw new RangeError('Wholesale price must be a non-negative number');
  }
  if (wholesaleUsd < NUMBER_PRICE_LOW_BAND_MAX_USD)
    return NUMBER_PRICE_FLOOR_USD;
  const multiplier = wholesaleUsd <= NUMBER_PRICE_MID_BAND_MAX_USD ? 3 : 2;
  return Math.max(
    NUMBER_PRICE_FLOOR_USD,
    ceilDollar(wholesaleUsd * multiplier),
  );
}
