import { Injectable } from '@nestjs/common';

export interface BusinessLocale {
  currency: string;
  locale: string;
  timezone: string;
}

/**
 * Every currency/date/time value shown to a user or baked into a PDF/message
 * must go through here, driven by the business's own currency/locale/timezone
 * — never hard-coded regional formatting (BE-014 / spec §1).
 */
@Injectable()
export class LocaleService {
  formatCurrency(
    amount: number | string,
    business: Pick<BusinessLocale, 'currency' | 'locale'>,
  ): string {
    const value = typeof amount === 'string' ? Number(amount) : amount;
    return new Intl.NumberFormat(business.locale, {
      style: 'currency',
      currency: business.currency,
    }).format(value);
  }

  formatDate(
    date: Date,
    business: Pick<BusinessLocale, 'locale' | 'timezone'>,
  ): string {
    return new Intl.DateTimeFormat(business.locale, {
      dateStyle: 'medium',
      timeZone: business.timezone,
    }).format(date);
  }

  formatDateTime(
    date: Date,
    business: Pick<BusinessLocale, 'locale' | 'timezone'>,
  ): string {
    return new Intl.DateTimeFormat(business.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: business.timezone,
    }).format(date);
  }

  /** Current wall-clock "HH:mm" in the business's timezone — used by the Nightly Close hourly tick. */
  currentLocalTime(timezone: string, at: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const hour = parts.find((p) => p.type === 'hour')!.value;
    const minute = parts.find((p) => p.type === 'minute')!.value;
    return `${hour}:${minute}`;
  }
}
