import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { MemoryNotesService } from './memory-notes.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MemoryNotesService (UPD-BE-026)', () => {
  let prisma: PrismaService;
  let memoryNotesService: MemoryNotesService;
  let businessId: string;
  let customerId: string;
  let supplierId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    memoryNotesService = new MemoryNotesService(
      tenantPrisma,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Memory Notes Test Biz',
        slug: `memory-notes-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'test-author');

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Noted Customer' },
    });
    customerId = customer.id;

    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Noted Supplier' },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await prisma.memoryNote.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a note on a real customer, stamped with the acting user', async () => {
    const note = await memoryNotesService.create({
      subjectType: 'customer',
      subjectId: customerId,
      body: 'Prefers WhatsApp over calls',
    });
    expect(note.authorUserId).toBe('test-author');
    expect(note.pinned).toBe(false);
  });

  it('rejects a note on a subject id that does not really exist', async () => {
    await expect(
      memoryNotesService.create({
        subjectType: 'customer',
        subjectId: 'not-a-real-customer-id',
        body: 'Should never be created',
      }),
    ).rejects.toThrow();
  });

  it('supports non-customer subjects too (e.g. supplier)', async () => {
    const note = await memoryNotesService.create({
      subjectType: 'supplier',
      subjectId: supplierId,
      body: 'Always ships a day late',
    });
    expect(note.subjectType).toBe('supplier');
  });

  it('lists notes scoped to one subject, pinned first, without leaking notes from another subject', async () => {
    await memoryNotesService.create({
      subjectType: 'customer',
      subjectId: customerId,
      body: 'Second note',
      pinned: true,
    });

    const notes = await memoryNotesService.list('customer', customerId);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes[0].pinned).toBe(true);
    expect(notes.every((n) => n.subjectId === customerId)).toBe(true);
  });

  it('updates a note body and pinned flag', async () => {
    const note = await memoryNotesService.create({
      subjectType: 'customer',
      subjectId: customerId,
      body: 'Original text',
    });
    const updated = await memoryNotesService.update(note.id, {
      body: 'Corrected text',
      pinned: true,
    });
    expect(updated.body).toBe('Corrected text');
    expect(updated.pinned).toBe(true);
  });

  it('deletes a note', async () => {
    const note = await memoryNotesService.create({
      subjectType: 'customer',
      subjectId: customerId,
      body: 'Temporary note',
    });
    await memoryNotesService.remove(note.id);

    const notes = await memoryNotesService.list('customer', customerId);
    expect(notes.find((n) => n.id === note.id)).toBeUndefined();
  });

  it('rejects updating/removing a note that does not exist', async () => {
    await expect(
      memoryNotesService.update('not-a-real-note-id', { body: 'x' }),
    ).rejects.toThrow();
    await expect(
      memoryNotesService.remove('not-a-real-note-id'),
    ).rejects.toThrow();
  });
});
