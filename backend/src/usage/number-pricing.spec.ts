import axios from 'axios';
import { customerNumberPriceUsd } from './number-pricing.util';
import { NumberPricingService } from './number-pricing.service';

jest.mock('axios');
const mockedGet = jest.fn();
(axios as unknown as { get: unknown }).get = mockedGet;

describe('customerNumberPriceUsd (pricing page C3 markup rule)', () => {
  it('uses the $4 floor under $1.35 wholesale', () => {
    expect(customerNumberPriceUsd(0)).toBe(4);
    expect(customerNumberPriceUsd(1.15)).toBe(4); // US / UK local
    expect(customerNumberPriceUsd(1.34)).toBe(4);
  });

  it('multiplies by 3 and rounds up between $1.35 and $10', () => {
    expect(customerNumberPriceUsd(1.35)).toBe(5); // 4.05 -> 5
    expect(customerNumberPriceUsd(2.15)).toBe(7); // US toll-free 6.45 -> 7
    expect(customerNumberPriceUsd(5.5)).toBe(17); // UK mobile 16.5 -> 17
    expect(customerNumberPriceUsd(6.5)).toBe(20); // AU mobile 19.5 -> 20
    expect(customerNumberPriceUsd(10)).toBe(30);
  });

  it('multiplies by 2 and rounds up above $10', () => {
    expect(customerNumberPriceUsd(10.01)).toBe(21);
    expect(customerNumberPriceUsd(14)).toBe(28); // UAE
    expect(customerNumberPriceUsd(20)).toBe(40);
  });

  it('never sells below cost or below the floor', () => {
    for (const wholesale of [0, 0.5, 1.15, 1.35, 3, 9.99, 10.01, 25, 80]) {
      const price = customerNumberPriceUsd(wholesale);
      expect(price).toBeGreaterThanOrEqual(4);
      expect(price).toBeGreaterThan(wholesale);
    }
  });

  it('is not thrown by floating point at band edges', () => {
    expect(customerNumberPriceUsd(1.2 * 1)).toBe(4);
    expect(customerNumberPriceUsd(3.3)).toBe(10); // 3.3 * 3 = 9.899999… -> 10
  });

  it('rejects invalid input', () => {
    expect(() => customerNumberPriceUsd(-1)).toThrow(RangeError);
    expect(() => customerNumberPriceUsd(NaN)).toThrow(RangeError);
  });
});

describe('NumberPricingService', () => {
  const config = (creds: boolean) =>
    ({
      get: (key: string) =>
        creds
          ? (
              { TWILIO_ACCOUNT_SID: 'ACx', TWILIO_AUTH_TOKEN: 'tok' } as Record<
                string,
                string
              >
            )[key]
          : undefined,
    }) as never;
  const meters = {
    unitPrice: jest.fn((m: string) =>
      Promise.resolve(m === 'phone_numbers_local' ? 4 : 7),
    ),
  } as never;

  beforeEach(() => mockedGet.mockReset());

  it('applies the markup to the live provider price', async () => {
    mockedGet.mockResolvedValue({
      data: {
        price_unit: 'USD',
        phone_number_prices: [
          { number_type: 'local', current_price: '14.00' },
          { number_type: 'toll free', current_price: '25.00' },
        ],
      },
    });
    const svc = new NumberPricingService(config(true), meters);
    await expect(svc.quote('ae', 'local')).resolves.toEqual({
      countryCode: 'AE',
      numberType: 'local',
      priceUsd: 28,
      source: 'live',
    });
    await expect(svc.quote('AE', 'tollfree')).resolves.toMatchObject({
      priceUsd: 50,
    });
  });

  it('refuses to guess a non-US price when the provider price is unavailable', async () => {
    const svc = new NumberPricingService(config(false), meters);
    await expect(svc.quote('AE', 'local')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PURCHASE_NOT_AVAILABLE',
      }) as unknown,
    });
  });

  it('refuses non-USD provider prices instead of converting', async () => {
    mockedGet.mockResolvedValue({
      data: {
        price_unit: 'EUR',
        phone_number_prices: [{ number_type: 'local', current_price: '1.00' }],
      },
    });
    const svc = new NumberPricingService(config(true), meters);
    await expect(svc.quote('DE', 'local')).rejects.toBeDefined();
  });

  it('falls back to the published floor only for the United States', async () => {
    mockedGet.mockRejectedValue(new Error('network'));
    const svc = new NumberPricingService(config(true), meters);
    await expect(svc.quote('US', 'local')).resolves.toMatchObject({
      priceUsd: 4,
      source: 'floor',
    });
    await expect(svc.quote('US', 'tollfree')).resolves.toMatchObject({
      priceUsd: 7,
      source: 'floor',
    });
  });

  it('rejects malformed country codes', async () => {
    const svc = new NumberPricingService(config(true), meters);
    await expect(svc.quote('USA', 'local')).rejects.toBeDefined();
  });
});
