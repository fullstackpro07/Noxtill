import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { PrismaService } from '../prisma/prisma.service';

interface CountryPrice {
  price: number;
  unit: string;
}

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const mask = (phone: string) => `•••• ${phone.slice(-4)}`;

/**
 * Phone-number recurring fees: one `twilio:phone_number_months` usage row per provisioned number
 * (business line and active tracking numbers) per UTC month. Cost comes from Twilio's published
 * local-number price list when available and is marked `estimated` — a list price, not an
 * invoice line; without credentials or a price it stays `unpriced`. Re-running is idempotent.
 */
@Injectable()
export class VoiceNumberFeesService {
  private readonly logger = new Logger(VoiceNumberFeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async recordMonth(now = new Date()): Promise<number> {
    const month = monthKey(now);
    const [lines, tracking] = await Promise.all([
      this.prisma.phoneNumber.findMany({
        select: { businessId: true, twilioSid: true, phoneNumber: true },
      }),
      this.prisma.voiceTrackingNumber.findMany({
        where: { active: true },
        select: { businessId: true, twilioSid: true, phoneNumber: true },
      }),
    ]);
    const numbers = [
      ...lines.map((n) => ({ ...n, kind: 'business_line' })),
      ...tracking.map((n) => ({ ...n, kind: 'tracking_number' })),
    ];
    const prices = new Map<string, CountryPrice | null>();
    let recorded = 0;
    for (const number of numbers) {
      const country =
        parsePhoneNumberFromString(number.phoneNumber)?.country ?? null;
      if (country && !prices.has(country)) {
        prices.set(country, await this.countryPrice(country));
      }
      const price = country ? (prices.get(country) ?? null) : null;
      const eventKey = `twilio:number-month:${number.twilioSid}:${month}`;
      const created = await this.prisma.voiceUsageRecord
        .create({
          data: {
            businessId: number.businessId,
            eventKey,
            provider: 'twilio',
            unit: 'phone_number_months',
            quantity: new Prisma.Decimal(1),
            cost: price ? new Prisma.Decimal(price.price) : null,
            currency: price ? price.unit.toUpperCase() : null,
            state: price ? 'estimated' : 'unpriced',
            evidence: {
              month,
              kind: number.kind,
              number: mask(number.phoneNumber),
              providerSid: number.twilioSid,
              country,
              priceSource: price
                ? 'twilio_pricing_api_local_list_price'
                : 'not_available',
            },
          },
        })
        .then(() => true)
        .catch((error: unknown) => {
          // Unique (businessId, eventKey): already recorded for this month.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )
            return false;
          throw error;
        });
      if (created) recorded += 1;
    }
    if (recorded)
      this.logger.log(
        `Recorded ${recorded} phone-number month(s) for ${month}`,
      );
    return recorded;
  }

  private async countryPrice(country: string): Promise<CountryPrice | null> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return null;
    try {
      const response = await axios.get<{
        price_unit?: string;
        phone_number_prices?: {
          number_type: string;
          current_price?: string;
          base_price?: string;
        }[];
      }>(`https://pricing.twilio.com/v1/PhoneNumbers/Countries/${country}`, {
        auth: { username: accountSid, password: authToken },
        timeout: 8000,
      });
      const local = response.data.phone_number_prices?.find(
        (p) => p.number_type === 'local',
      );
      const value = Number(local?.current_price ?? local?.base_price);
      if (
        !local ||
        !Number.isFinite(value) ||
        value < 0 ||
        !response.data.price_unit
      )
        return null;
      return { price: value, unit: response.data.price_unit };
    } catch {
      return null;
    }
  }
}
