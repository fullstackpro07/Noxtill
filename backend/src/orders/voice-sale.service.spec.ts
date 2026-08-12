import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { VoiceSaleService } from './voice-sale.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (same pattern as customer-import.service.spec.ts). Mocking the whole util keeps
// this spec focused on voice-parsing orchestration, not file-type sniffing.
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceSaleService (UPD-BE-008)', () => {
  let prisma: PrismaService;
  let voiceSaleService: VoiceSaleService;
  let businessId: string;
  let productId: string;
  const speechToText = { transcribe: jest.fn() };
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const ordersService = new OrdersService(
      tenantPrisma,
      cls as unknown as ClsService,
      {
        send: jest.fn().mockResolvedValue(undefined),
      } as unknown as SendGateService,
      {
        scheduleSend: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReviewRequestsService,
      {
        issueRewardIfEligible: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReferralsService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as ActivityService,
      {
        recordSaleMovement: jest.fn().mockResolvedValue(undefined),
      } as unknown as CashRegisterService,
    );
    voiceSaleService = new VoiceSaleService(
      tenantPrisma,
      speechToText as unknown as SpeechToTextService,
      aiInfra as unknown as AiInfraService,
      ordersService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Voice Sale Test Biz',
        slug: `voice-sale-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Chai Regular',
        costPrice: 2,
        sellingPrice: 5,
        stockQty: 50,
        active: true,
      },
    });
    productId = product.id;
  });

  afterEach(() => {
    speechToText.transcribe.mockReset();
    aiInfra.complete.mockReset();
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.voiceSaleDraft.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const audioFile = {
    buffer: Buffer.from('fake audio bytes'),
    size: 1000,
    mimetype: 'audio/webm',
    originalname: 'sale.webm',
  };

  it('parses real audio into a staged draft, matching an existing product by name', async () => {
    speechToText.transcribe.mockResolvedValue('Two chai regular, cash');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        items: [{ productName: 'Chai Regular', qty: 2 }],
        customerName: null,
        paymentMethodGuess: 'cash',
      }),
    );

    const result = await voiceSaleService.parse(businessId, audioFile);

    expect(result.transcript).toBe('Two chai regular, cash');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ productId, matched: true, qty: 2 });
    expect(result.paymentMethodGuess).toBe('cash');

    const draft = await prisma.voiceSaleDraft.findUnique({
      where: { id: result.id },
    });
    expect(draft).not.toBeNull();
  });

  it('marks an item unmatched when no real product name is close enough', async () => {
    speechToText.transcribe.mockResolvedValue('One flying saucer, cash');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        items: [{ productName: 'Flying Saucer', qty: 1 }],
        customerName: null,
        paymentMethodGuess: 'cash',
      }),
    );

    const result = await voiceSaleService.parse(businessId, audioFile);
    expect(result.items[0]).toMatchObject({ productId: null, matched: false });
  });

  it('never throws and returns an empty cart when the AI response is not valid JSON', async () => {
    speechToText.transcribe.mockResolvedValue('mumble mumble');
    aiInfra.complete.mockResolvedValue('not json at all');

    const result = await voiceSaleService.parse(businessId, audioFile);
    expect(result.items).toEqual([]);
  });

  it('propagates a real transcription failure (e.g. disclosed missing OPENAI_API_KEY) rather than fabricating a draft', async () => {
    speechToText.transcribe.mockRejectedValue(
      new Error('Voice transcription is not available'),
    );

    await expect(
      voiceSaleService.parse(businessId, audioFile),
    ).rejects.toThrow();
  });

  it('confirm() never writes a sale from the AI guess directly — only from the caller-supplied final cart', async () => {
    speechToText.transcribe.mockResolvedValue('Two chai regular, cash');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        items: [{ productName: 'Chai Regular', qty: 2 }],
        customerName: null,
        paymentMethodGuess: 'cash',
      }),
    );
    const draft = await voiceSaleService.parse(businessId, audioFile);

    // The caller corrects the quantity from 2 to 3 before confirming — proving confirm() uses
    // exactly what it's given, not the AI's original guess.
    const order = await voiceSaleService.confirm(businessId, draft.id, {
      items: [{ productId, qty: 3 }],
      payment: { method: 'cash' },
    });

    expect(order.status).toBe('completed');
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
    });
    expect(items[0].qty).toBe(3);

    const stillDraft = await prisma.voiceSaleDraft.findUnique({
      where: { id: draft.id },
    });
    expect(stillDraft).toBeNull();
  });

  it('rejects confirming a draft id that does not belong to this business', async () => {
    const other = await prisma.business.create({
      data: { name: 'Other Biz', slug: `other-voice-${Date.now()}` },
    });
    const foreignDraft = await prisma.voiceSaleDraft.create({
      data: {
        businessId: other.id,
        transcript: 'x',
        parsedCart: { items: [] },
      },
    });

    await expect(
      voiceSaleService.confirm(businessId, foreignDraft.id, {
        items: [{ productId, qty: 1 }],
        payment: { method: 'cash' },
      }),
    ).rejects.toThrow();

    await prisma.voiceSaleDraft.delete({ where: { id: foreignDraft.id } });
    await prisma.business.delete({ where: { id: other.id } });
  });
});
