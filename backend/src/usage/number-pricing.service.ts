import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppException } from '../common/filters/app.exception';
import { customerNumberPriceUsd } from './number-pricing.util';
import { MetersService } from './meters.service';
import { USAGE_ERROR_CODES } from './usage.constants';

export type NumberKind = 'local' | 'tollfree';

export interface NumberQuote {
  countryCode: string;
  numberType: NumberKind;
  /** What the customer pays per month. */
  priceUsd: number;
  /** 'live' = provider price x markup rule; 'floor' = the published US floor (provider unreachable). */
  source: 'live' | 'floor';
}

const TWILIO_TYPE: Record<NumberKind, string> = {
  local: 'local',
  tollfree: 'toll free',
};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Per-country phone number pricing (pricing page spec C3). The wholesale price is read from the
 * telephony provider's pricing API for the selected country at quote time, then the markup rule
 * is applied — there is deliberately no hard-coded country table, because a stale table silently
 * sells numbers below cost.
 *
 * If the provider price can't be read, the price is NOT guessed: the purchase is refused. The one
 * exception is a United States number, where the published floor is known to be above cost.
 */
@Injectable()
export class NumberPricingService {
  private readonly cache = new Map<
    string,
    { at: number; wholesale: number | null }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly meters: MetersService,
  ) {}

  async quote(
    countryCode: string,
    numberType: NumberKind,
  ): Promise<NumberQuote> {
    const country = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country))
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        'Choose a valid country for this number.',
        HttpStatus.BAD_REQUEST,
      );
    const wholesale = await this.wholesale(country, numberType);
    if (wholesale != null) {
      return {
        countryCode: country,
        numberType,
        priceUsd: customerNumberPriceUsd(wholesale),
        source: 'live',
      };
    }
    if (country === 'US') {
      const floor = await this.meters.unitPrice(
        numberType === 'local'
          ? 'phone_numbers_local'
          : 'phone_numbers_tollfree',
      );
      if (floor != null)
        return {
          countryCode: country,
          numberType,
          priceUsd: floor,
          source: 'floor',
        };
    }
    throw new AppException(
      USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
      `We can't confirm the current price of ${numberType === 'local' ? 'local' : 'toll-free'} numbers in ${country} right now, so none can be bought. Try again shortly or contact support.`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /** Provider monthly price in USD, or null when it can't be determined. Cached for a few hours. */
  private async wholesale(
    country: string,
    numberType: NumberKind,
  ): Promise<number | null> {
    const key = `${country}:${numberType}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.wholesale;
    const value = await this.fetchWholesale(country, numberType);
    // Failures are cached briefly (not for hours) so an outage doesn't hammer the provider.
    this.cache.set(key, {
      at: value == null ? Date.now() - CACHE_TTL_MS + 60_000 : Date.now(),
      wholesale: value,
    });
    return value;
  }

  private async fetchWholesale(
    country: string,
    numberType: NumberKind,
  ): Promise<number | null> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!sid || !token) return null;
    try {
      const response = await axios.get<{
        price_unit?: string;
        phone_number_prices?: {
          number_type: string;
          current_price?: string;
          base_price?: string;
        }[];
      }>(`https://pricing.twilio.com/v1/PhoneNumbers/Countries/${country}`, {
        auth: { username: sid, password: token },
        timeout: 8000,
      });
      // Only USD prices are usable: converting currencies here would be a guess.
      if ((response.data.price_unit ?? '').toUpperCase() !== 'USD') return null;
      const row = response.data.phone_number_prices?.find(
        (p) => p.number_type === TWILIO_TYPE[numberType],
      );
      const value = Number(row?.current_price ?? row?.base_price);
      return row && Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return null;
    }
  }
}
