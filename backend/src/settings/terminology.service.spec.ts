import { PrismaService } from '../prisma/prisma.service';
import { TerminologyService } from './terminology.service';
import { DEFAULT_TERMS } from './terminology.constants';

describe('TerminologyService (UPD-BE-038)', () => {
  let prisma: PrismaService;
  let service: TerminologyService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new TerminologyService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'Terminology Test Biz',
        slug: `terminology-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.labelOverride.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('getAll() returns real defaults before any override exists', async () => {
    const all = await service.getAll(businessId);
    expect(all.general.customer).toBe(DEFAULT_TERMS.general.customer);
    expect(all.pdf.subtotal).toBe(DEFAULT_TERMS.pdf.subtotal);
  });

  it('setMany() persists real overrides that getAll()/getArea() then reflect', async () => {
    const result = await service.setMany(businessId, [
      { area: 'general', key: 'customer', value: 'Client' },
      { area: 'pdf', key: 'total', value: 'Grand Total' },
    ]);
    expect(result.general.customer).toBe('Client');
    expect(result.pdf.total).toBe('Grand Total');
    // Untouched terms still fall back to the real default.
    expect(result.general.order).toBe(DEFAULT_TERMS.general.order);

    const area = await service.getArea(businessId, 'pdf');
    expect(area.total).toBe('Grand Total');
    expect(area.subtotal).toBe(DEFAULT_TERMS.pdf.subtotal);

    // Re-setting the SAME key updates in place rather than duplicating.
    await service.setMany(businessId, [
      { area: 'general', key: 'customer', value: 'Guest' },
    ]);
    const overrides = await prisma.labelOverride.findMany({
      where: { businessId, area: 'general', key: 'customer' },
    });
    expect(overrides).toHaveLength(1);
    expect(overrides[0].value).toBe('Guest');
  });

  it('applyToText() substitutes real {{term:key}} and {{term:area.key}} placeholders', async () => {
    await service.setMany(businessId, [
      { area: 'general', key: 'appointment', value: 'Session' },
    ]);

    const result = await service.applyToText(
      businessId,
      'Your {{term:appointment}} with {{term:general.customer}} is confirmed.',
    );
    expect(result).toBe('Your Session with Guest is confirmed.');
  });

  it('applyToText() never touches text with no {{term:}} placeholder (the common case)', async () => {
    const text = 'Hi there, your order is ready. Total: {{amount}}';
    const result = await service.applyToText(businessId, text);
    expect(result).toBe(text);
  });

  it('applyToText() falls back to the bare key for a genuinely unknown area/key rather than leaving a broken placeholder', async () => {
    const result = await service.applyToText(
      businessId,
      'See you at {{term:not-a-real-area.not-a-real-key}}!',
    );
    expect(result).toBe('See you at not-a-real-key!');
  });
});
