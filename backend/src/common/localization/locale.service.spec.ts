import { LocaleService } from './locale.service';

describe('LocaleService (BE-014)', () => {
  const service = new LocaleService();

  it('formats the same amount differently per business currency/locale', () => {
    const usd = service.formatCurrency(1234.5, {
      currency: 'USD',
      locale: 'en-US',
    });
    const pkr = service.formatCurrency(1234.5, {
      currency: 'PKR',
      locale: 'en-PK',
    });

    expect(usd).toContain('1,234.50');
    expect(usd).not.toBe(pkr);
  });

  it('formats dates in the business timezone', () => {
    const date = new Date('2026-01-15T23:30:00Z');
    const tokyo = service.formatDate(date, {
      locale: 'en-US',
      timezone: 'Asia/Tokyo',
    });
    const losAngeles = service.formatDate(date, {
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
    });

    // Same instant, different calendar day in these two zones.
    expect(tokyo).not.toBe(losAngeles);
  });

  it('computes current local HH:mm for a timezone', () => {
    const at = new Date('2026-01-15T12:00:00Z');
    expect(service.currentLocalTime('UTC', at)).toBe('12:00');
  });
});
