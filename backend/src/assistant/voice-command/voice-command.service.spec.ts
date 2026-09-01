import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { VoiceCommandService } from './voice-command.service';
import { SpeechToTextService } from '../../ai/speech-to-text.service';
import { AiInfraService } from '../../ai/ai-infra.service';
import { InventoryService } from '../../inventory/inventory.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { CustomersService } from '../../customers/customers.service';
import { CashRegisterService } from '../../cash-register/cash-register.service';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { Role } from '@prisma/client';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (same pattern as voice-sale.service.spec.ts). Mocking the whole util keeps this
// spec focused on voice-command parsing/confirm orchestration, not file-type sniffing.
jest.mock('../../common/utils/file-validation.util', () => ({
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

const fakeFile = {
  buffer: Buffer.from('fake-audio'),
  size: 10,
  mimetype: 'audio/webm',
  originalname: 'clip.webm',
};

describe('VoiceCommandService (UPD-BE-113)', () => {
  let prisma: PrismaService;
  let service: VoiceCommandService;
  let businessId: string;
  let userId: string;
  let productId: string;

  const speechToText = { transcribe: jest.fn() };
  const aiInfra = { complete: jest.fn() };
  const inventoryService = { recordWastage: jest.fn() };
  const expensesService = { create: jest.fn() };
  const customersService = { create: jest.fn() };
  const cashRegisterService = { recordMovement: jest.fn() };

  function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      sub: userId,
      businessId,
      role: Role.staff,
      capabilities: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceCommandService(
      tenantPrisma,
      speechToText as unknown as SpeechToTextService,
      aiInfra as unknown as AiInfraService,
      inventoryService as unknown as InventoryService,
      expensesService as unknown as ExpensesService,
      customersService as unknown as CustomersService,
      cashRegisterService as unknown as CashRegisterService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Voice Command Test Biz',
        slug: `voice-command-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const testUser = await prisma.user.create({
      data: {
        name: 'Voice Command Test User',
        email: `voice-command-test-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = testUser.id;

    const product = await prisma.product.create({
      data: { businessId, name: 'Sourdough Bread', active: true, stockQty: 10 },
    });
    productId = product.id;
  });

  afterEach(() => {
    speechToText.transcribe.mockClear();
    aiInfra.complete.mockClear();
    inventoryService.recordWastage.mockClear();
    expensesService.create.mockClear();
    customersService.create.mockClear();
    cashRegisterService.recordMovement.mockClear();
  });

  afterAll(async () => {
    await prisma.voiceCommandDraft.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('parses a wastage command, fuzzy-matches the real product, and stages a pending draft (never writes yet)', async () => {
    speechToText.transcribe.mockResolvedValue(
      'we lost 3 loaves of bread, they expired',
    );
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'record_wastage',
        args: { productName: 'bread', qty: 3, reason: 'Expired' },
      }),
    );

    const proposed = await service.propose(businessId, userId, fakeFile);

    expect(proposed.action).toBe('record_wastage');
    expect(proposed.args.productId).toBe(productId);
    expect(proposed.args.matched).toBe(true);
    expect(proposed.humanSummary).toContain('Sourdough Bread');
    expect(inventoryService.recordWastage).not.toHaveBeenCalled();

    const draft = await prisma.voiceCommandDraft.findUnique({
      where: { id: proposed.id },
    });
    expect(draft?.status).toBe('pending');
  });

  it('rejects a transcript that matches none of the supported actions', async () => {
    speechToText.transcribe.mockResolvedValue('what a nice day today');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({ action: 'unrecognized', args: {} }),
    );

    await expect(
      service.propose(businessId, userId, fakeFile),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('confirm() performs the real write only after being called, through the same service any other caller would use', async () => {
    speechToText.transcribe.mockResolvedValue('lost 2 loaves, damaged');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'record_wastage',
        args: { productName: 'bread', qty: 2, reason: 'Damaged' },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    inventoryService.recordWastage.mockResolvedValue({ id: 'movement-1' });
    const result = await service.confirm(user(), proposed.id, undefined);

    expect(inventoryService.recordWastage).toHaveBeenCalledWith(businessId, {
      productId,
      qty: 2,
      reason: 'Damaged',
      note: undefined,
    });
    expect(result).toEqual({ id: 'movement-1' });

    const draft = await prisma.voiceCommandDraft.findUnique({
      where: { id: proposed.id },
    });
    expect(draft?.status).toBe('confirmed');
    expect(draft?.confirmedAt).not.toBeNull();
  });

  it('confirm() applies an argsOverride on top of the parsed args before writing', async () => {
    speechToText.transcribe.mockResolvedValue('lost 1 loaf, expired');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'record_wastage',
        args: { productName: 'bread', qty: 1, reason: 'Expired' },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    inventoryService.recordWastage.mockResolvedValue({ id: 'movement-2' });
    await service.confirm(user(), proposed.id, { qty: 5 });

    expect(inventoryService.recordWastage).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({ qty: 5 }),
    );
  });

  it('confirm() rejects a wastage command with no matched product until argsOverride supplies one', async () => {
    speechToText.transcribe.mockResolvedValue('lost some gizmos');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'record_wastage',
        args: { productName: 'nonexistent gizmo', qty: 1, reason: 'Other' },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);
    expect(proposed.args.productId).toBeNull();

    await expect(
      service.confirm(user(), proposed.id, undefined),
    ).rejects.toBeInstanceOf(AppException);
    expect(inventoryService.recordWastage).not.toHaveBeenCalled();
  });

  it('confirm() blocks add_expense for a caller without EXPENSES_MANAGE', async () => {
    speechToText.transcribe.mockResolvedValue('add a 50 dollar rent expense');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'add_expense',
        args: { description: 'Rent', category: 'Rent', amount: 50 },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    await expect(
      service.confirm(user({ capabilities: [] }), proposed.id, undefined),
    ).rejects.toThrow('Ask the owner for access');
    expect(expensesService.create).not.toHaveBeenCalled();
  });

  it('confirm() allows add_expense once the caller has EXPENSES_MANAGE, and writes through ExpensesService', async () => {
    speechToText.transcribe.mockResolvedValue('add a 50 dollar rent expense');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'add_expense',
        args: { description: 'Rent', category: 'Rent', amount: 50 },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    expensesService.create.mockResolvedValue({ id: 'expense-1' });
    await service.confirm(
      user({ capabilities: [CAPABILITIES.EXPENSES_MANAGE] }),
      proposed.id,
      undefined,
    );

    expect(expensesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Rent',
        category: 'Rent',
        amount: 50,
      }),
    );
  });

  it('cancel() marks a pending draft rejected, and confirm() on it afterward fails', async () => {
    speechToText.transcribe.mockResolvedValue('add customer Jane, 555-0100');
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'add_customer',
        args: { name: 'Jane', phone: '555-0100' },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    await service.cancel(businessId, proposed.id);
    const draft = await prisma.voiceCommandDraft.findUnique({
      where: { id: proposed.id },
    });
    expect(draft?.status).toBe('rejected');

    await expect(
      service.confirm(user(), proposed.id, undefined),
    ).rejects.toBeInstanceOf(AppException);
    expect(customersService.create).not.toHaveBeenCalled();
  });

  it('record_cash_movement confirms through CashRegisterService with a normalized type/amount', async () => {
    speechToText.transcribe.mockResolvedValue(
      'take 20 out of the drawer for a supplier',
    );
    aiInfra.complete.mockResolvedValue(
      JSON.stringify({
        action: 'record_cash_movement',
        args: { type: 'cash_out', amount: 20, note: 'supplier' },
      }),
    );
    const proposed = await service.propose(businessId, userId, fakeFile);

    cashRegisterService.recordMovement.mockResolvedValue({ id: 'movement-3' });
    await service.confirm(user(), proposed.id, undefined);

    expect(cashRegisterService.recordMovement).toHaveBeenCalledWith(
      businessId,
      {
        type: 'cash_out',
        amount: 20,
        note: 'supplier',
      },
    );
  });
});
