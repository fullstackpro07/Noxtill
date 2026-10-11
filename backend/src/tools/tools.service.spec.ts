import { BadRequestException } from '@nestjs/common';
import { ToolsService } from './tools.service';

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(() => {
    service = new ToolsService();
  });

  describe('FT-01: calculateDiscount', () => {
    it('calculates percentage discount accurately', () => {
      const res = service.calculateDiscount({
        originalUnitPrice: 100,
        quantity: 2,
        discountMode: 'percent',
        discountPercent: 20,
        taxMode: 'none',
      });
      expect(res.gross).toBe(200);
      expect(res.totalDiscount).toBe(40);
      expect(res.net).toBe(160);
      expect(res.finalTotal).toBe(160);
      expect(res.savingsPct).toBe(20);
    });

    it('calculates fixed amount discount', () => {
      const res = service.calculateDiscount({
        originalUnitPrice: 50,
        quantity: 1,
        discountMode: 'fixed',
        discountAmount: 15,
      });
      expect(res.gross).toBe(50);
      expect(res.totalDiscount).toBe(15);
      expect(res.net).toBe(35);
      expect(res.savingsPct).toBe(30);
    });

    it('calculates stacked sequential discounts with exclusive tax', () => {
      const res = service.calculateDiscount({
        originalUnitPrice: 100,
        quantity: 1,
        discountMode: 'stacked',
        stackedDiscounts: [20, 10], // 100 - 20 = 80; 80 - 8 = 72
        taxMode: 'exclusive',
        taxPercent: 10, // 72 * 0.1 = 7.2
      });
      expect(res.gross).toBe(100);
      expect(res.totalDiscount).toBe(28);
      expect(res.net).toBe(72);
      expect(res.tax).toBe(7.2);
      expect(res.finalTotal).toBe(79.2);
    });
  });

  describe('FT-02: calculateMargin', () => {
    it('computes gross margin, markup, and target price', () => {
      const res = service.calculateMargin({
        salePrice: 100,
        costOfGoods: 60,
        paymentFeePercent: 3,
        targetGrossMargin: 40,
      });
      expect(res.directCost).toBe(60);
      expect(res.processingFee).toBe(3);
      expect(res.profitDollar).toBe(37);
      expect(res.grossMarginPct).toBe(37);
      expect(res.markupPct).toBe(61.67);
      expect(res.targetPrice).toBe(105.26); // 60 / (1 - (0.4 + 0.03)) = 60 / 0.57 = 105.26
    });
  });

  describe('FT-03: calculateBreakEven', () => {
    it('computes whole units and threshold revenue', () => {
      const res = service.calculateBreakEven({
        fixedCosts: 1000,
        sellingPricePerUnit: 50,
        variableCostPerUnit: 30,
        targetProfit: 400,
      });
      expect(res.possible).toBe(true);
      expect(res.contributionMargin).toBe(20);
      expect(res.breakEvenUnits).toBe(50); // 1000 / 20 = 50
      expect(res.breakEvenRevenue).toBe(2500); // 50 * 50
      expect(res.targetProfitUnits).toBe(70); // (1000 + 400) / 20 = 70
      expect(res.targetProfitRevenue).toBe(3500);
    });

    it('rejects when variable cost exceeds or equals price', () => {
      const res = service.calculateBreakEven({
        fixedCosts: 1000,
        sellingPricePerUnit: 25,
        variableCostPerUnit: 30,
      });
      expect(res.possible).toBe(false);
      expect(res.breakEvenUnits).toBeNull();
    });
  });

  describe('FT-04: calculateInvoice', () => {
    it('computes line items, discounts, taxes, and subtotal', () => {
      const res = service.calculateInvoice({
        lines: [
          {
            description: 'Consulting',
            quantity: 10,
            unitPrice: 100,
            discountPercent: 10,
            taxPercent: 5,
          },
          {
            description: 'Setup',
            quantity: 1,
            unitPrice: 200,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      });
      // Line 1: gross 1000, disc 100, net 900, tax 45, total 945
      // Line 2: gross 200, disc 0, net 200, tax 0, total 200
      expect(res.subtotal).toBe(1100);
      expect(res.totalDiscount).toBe(100);
      expect(res.totalTax).toBe(45);
      expect(res.totalAmount).toBe(1145);
    });
  });

  describe('FT-05: encodeQr', () => {
    it('generates valid SVG and dataUrl for URL payload', async () => {
      const res = await service.encodeQr({
        qrType: 'url',
        payload: 'https://noxtill.com',
      });
      expect(res.payload).toBe('https://noxtill.com');
      expect(res.svg).toContain('<svg');
      expect(res.dataUrl).toContain('data:image/png;base64,');
    });

    it('formats WiFi payload correctly', async () => {
      const res = await service.encodeQr({
        qrType: 'wifi',
        wifi: {
          ssid: 'GuestWifi',
          password: 'secretpassword',
          encryption: 'WPA',
        },
      });
      expect(res.payload).toContain('WIFI:T:WPA;S:GuestWifi;P:secretpassword;');
    });

    it('throws BadRequestException if payload is empty', async () => {
      await expect(
        service.encodeQr({ qrType: 'text', payload: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FT-06: composeReviewKit', () => {
    it('builds neutral review card with valid QR code', async () => {
      const res = await service.composeReviewKit({
        reviewLink: 'https://g.page/r/example/review',
        businessDisplayName: 'Austin Bakery',
      });
      expect(res.cardHeadline).toContain('Austin Bakery');
      expect(res.reviewLink).toBe('https://g.page/r/example/review');
      expect(res.qrSvg).toContain('<svg');
    });
  });

  describe('FT-07: composeWhatsapp', () => {
    it('normalizes international phone number and encodes message', async () => {
      const res = await service.composeWhatsapp({
        internationalNumber: '+1 415 555 2671',
        prefilledMessage: 'Hi Noxtill, I would like to book a demo!',
      });
      expect(res.internationalNumber).toBe('14155552671');
      expect(res.fullUrl).toContain('https://wa.me/14155552671?text=');
      expect(res.qrSvg).toContain('<svg');
    });

    it('throws when phone number is too short or invalid', async () => {
      await expect(
        service.composeWhatsapp({ internationalNumber: '123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FT-08: composeUtm', () => {
    it('composes valid UTM link while preserving query params and hash', async () => {
      const res = await service.composeUtm({
        destinationUrl: 'https://noxtill.com/pricing?ref=banner#plans',
        utmSource: 'newsletter',
        utmMedium: 'email',
        utmCampaign: 'october_launch',
      });
      expect(res.finalUrl).toContain('https://noxtill.com/pricing');
      expect(res.finalUrl).toContain('ref=banner');
      expect(res.finalUrl).toContain('utm_source=newsletter');
      expect(res.finalUrl).toContain('utm_medium=email');
      expect(res.finalUrl).toContain('utm_campaign=october_launch');
      expect(res.finalUrl).toContain('#plans');
    });
  });

  describe('FT-09: renderSignature', () => {
    it('renders clean HTML signature and text representation', () => {
      const res = service.renderSignature({
        fullName: 'Jane Doe',
        companyName: 'Acme Corp',
        jobTitle: 'VP Operations',
        email: 'jane@acme.com',
        website: 'https://acme.com',
        template: 'modern',
      });
      expect(res.html).toContain('Jane Doe');
      expect(res.html).toContain('Acme Corp');
      expect(res.html).toContain('jane@acme.com');
      expect(res.plainText).toContain('Jane Doe');
    });
  });

  describe('FT-10: calculateMissedCallRevenue', () => {
    it('models multi-step conversion funnel across 3 scenarios', () => {
      const res = service.calculateMissedCallRevenue({
        missedCalls: 100,
        eligibleSharePct: 80,
        contactRatePct: 50,
        bookingRatePct: 40,
        saleClosePct: 60,
        averageSaleValue: 200,
        grossMarginPct: 50,
      });
      // 100 calls -> 80 eligible -> 40 reached -> 16 booked -> 9.6 closed
      // 9.6 * 200 = 1920 monthly revenue, 960 monthly gross profit
      expect(res.base.eligibleCallers).toBe(80);
      expect(res.base.reachedCallers).toBe(40);
      expect(res.base.bookedAppointments).toBe(16);
      expect(res.base.closedSales).toBe(9.6);
      expect(res.base.lostRevenueMonthly).toBe(1920);
      expect(res.base.lostProfitMonthly).toBe(960);
      expect(res.base.lostRevenueAnnual).toBe(23040);
      expect(res.conservative.lostRevenueMonthly).toBeLessThan(
        res.base.lostRevenueMonthly,
      );
      expect(res.optimistic.lostRevenueMonthly).toBeGreaterThan(
        res.base.lostRevenueMonthly,
      );
    });
  });
});
