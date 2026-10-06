import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { S3Service } from '../common/storage/s3.service';
import type { PayContextService } from '../payments/pay-context.service';
import type { PayRequestsService } from '../payments/pay-requests.service';
import type { HelpdeskTicketsService } from '../helpdesk/helpdesk-tickets.service';
import type { HelpdeskContextService } from '../helpdesk/helpdesk-context.service';
import { FsActor, FsContextService, num } from './fs-context.service';
import { FsDataService, parseFsScope } from './fs-data.service';
import { FsNotifyService } from './fs-notify.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FsPartsService } from './fs-parts.service';
import { FsLaborService } from './fs-labor.service';
import { FsPlansService } from './fs-plans.service';
import { FsCasesService } from './fs-cases.service';
import { FsRequestsService } from './fs-requests.service';
import { FsAdminService } from './fs-admin.service';
import { FsApprovalsService } from './fs-approvals.service';
import { FsViewsService } from './fs-views.service';
import { FsDrawersService } from './fs-drawers.service';
import { FS_SECS, FS_TABS } from './fs.constants';

const codeOf = (e: unknown) =>
  ((e as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(codeOf(caught) ?? (caught as Error)?.message).toBe(code);
}

describe('Field Service (real DB)', () => {
  jest.setTimeout(60_000);
  const stamp = Date.now();
  let prisma: PrismaService;
  let ctx: FsContextService;
  let data: FsDataService;
  let wos: FsWorkOrdersService;
  let parts: FsPartsService;
  let labor: FsLaborService;
  let plans: FsPlansService;
  let reqs: FsRequestsService;
  let admin: FsAdminService;
  let approvals: FsApprovalsService;
  let views: FsViewsService;
  let drawers: FsDrawersService;
  let businessId: string;
  let owner: FsActor;
  let staff: FsActor;
  let ownerId: string;
  let staffId: string;
  let customerId: string;
  let productId: string;
  let assetId: string;
  let siteId: string;
  let svcId: string;
  let woId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Field Service Test Biz',
          slug: `fs-test-${stamp}`,
          currency: 'PKR',
          timezone: 'Asia/Karachi',
          country: 'PK',
        },
      })
    ).id;
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `fs-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, s] = await Promise.all([
      mk('Olive Owner', 'o'),
      mk('Tariq Tech', 't'),
    ]);
    ownerId = o.id;
    staffId = s.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner, hourlyRate: 1500 },
        { businessId, userId: s.id, role: Role.staff },
      ],
    });
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Lahore Grand Hotel',
          phone: `+92300${String(stamp).slice(-7)}`,
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Run capacitor 45µF',
          costPrice: 1800,
          sellingPrice: 2500,
          stockQty: 2,
        },
      })
    ).id;
    assetId = (
      await prisma.amAsset.create({
        data: {
          businessId,
          number: `AST-FS-${stamp}`,
          name: 'Carrier rooftop AC',
          ownerType: 'Customer-owned',
          customerId,
          serial: 'CR-50TC-1',
          status: 'Active',
          warrantyEnd: new Date(Date.now() + 100 * 86400000),
        },
      })
    ).id;

    ctx = new FsContextService(prisma, new CapabilitiesService(prisma));
    data = new FsDataService(ctx);
    const notify = {
      send: () => Promise.resolve({ sent: false, why: 'test — not sent' }),
    } as unknown as FsNotifyService;
    const s3 = {
      upload: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      getSignedDownloadUrl: () => Promise.resolve('u'),
    } as unknown as S3Service;
    wos = new FsWorkOrdersService(
      ctx,
      data,
      notify,
      s3,
      {} as PayContextService,
      {} as PayRequestsService,
    );
    parts = new FsPartsService(ctx, data, wos);
    labor = new FsLaborService(ctx, wos);
    plans = new FsPlansService(ctx, data, wos);
    const cases = new FsCasesService(ctx, wos, notify, s3);
    reqs = new FsRequestsService(
      ctx,
      data,
      wos,
      notify,
      s3,
      {} as HelpdeskTicketsService,
      {} as HelpdeskContextService,
      cases,
    );
    admin = new FsAdminService(ctx);
    approvals = new FsApprovalsService(ctx, wos, parts);
    views = new FsViewsService(ctx, data);
    drawers = new FsDrawersService(ctx, data, views);
    const actor = (id: string, role: Role) =>
      ctx.actor({ sub: id, businessId, role } as AuthenticatedUser);
    owner = await actor(o.id, Role.owner);
    staff = await actor(s.id, Role.staff);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.$executeRawUnsafe(
        'DELETE m FROM fs_part_moves m JOIN fs_wo_parts p ON p.id = m.part_id JOIN fs_work_orders w ON w.id = p.wo_id WHERE w.business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE p FROM fs_wo_parts p JOIN fs_work_orders w ON w.id = p.wo_id WHERE w.business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE i FROM fs_plan_instances i JOIN fs_plans p ON p.id = i.plan_id WHERE p.business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE i FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.business_id = ?',
        businessId,
      );
      for (const t of [
        'fs_settings',
        'fs_settings_versions',
        'fs_service_types',
        'fs_technicians',
        'fs_sites',
        'fs_equipment_sites',
        'fs_requests',
        'fs_work_orders',
        'fs_labor',
        'fs_events',
        'fs_files',
        'fs_templates',
        'fs_inspections',
        'fs_plans',
        'fs_agreements',
        'fs_warranty',
        'fs_approvals',
        'fs_audit',
        'fs_idem',
        'orders',
        'am_assets',
        'stock_movements',
        'products',
        'customers',
        'notifications',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe(
        'DELETE FROM business_users WHERE business_id = ?',
        businessId,
      );
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${stamp}@example.com` } },
    });
    await prisma.$disconnect();
  });

  it('gives the owner every field right and staff technician rights only', () => {
    expect(
      owner.dispatch && owner.approve && owner.settings && owner.money,
    ).toBe(true);
    expect([
      staff.request,
      staff.execute,
      staff.dispatch,
      staff.approve,
      staff.money,
    ]).toEqual([true, true, false, false, false]);
    expect(staff.techOnly).toBe(true);
  });

  it('sets up territories, a service type, technicians and a site', async () => {
    const s = await ctx.ensure(businessId);
    await admin.save(owner, {
      expectedVersion: s.version,
      config: { territories: ['Gulberg', 'DHA'], adj: { Gulberg: ['DHA'] } },
    });
    await expectCode(
      admin.save(owner, {
        expectedVersion: s.version,
        config: { priorities: [] },
      }),
      'VERSION_CONFLICT',
    );
    await expectCode(
      admin.save(owner, {
        expectedVersion: s.version + 1,
        config: {
          labor: {
            overlap: false,
            manualReason: true,
            roundMin: 5,
            overtimeAfter: 9,
          },
        },
      }),
      'REASON_REQUIRED',
    );
    await admin.saveServiceType(owner, null, {
      code: 'AC-RPR',
      name: 'AC repair',
      skill: 'HVAC',
      durMin: 90,
      priority: 'High',
      proof: 'Signature',
      partProductIds: [productId],
    });
    svcId = (
      await prisma.fsServiceType.findFirstOrThrow({ where: { businessId } })
    ).id;
    await admin.saveTechnician(owner, {
      userId: ownerId,
      skills: ['HVAC'],
      certs: [],
      territories: ['Gulberg'],
      shiftStart: 0,
      shiftEnd: 24,
      tracking: true,
      active: true,
    });
    await admin.saveTechnician(owner, {
      userId: staffId,
      skills: ['Plumbing'],
      certs: [],
      territories: ['DHA'],
      shiftStart: 0,
      shiftEnd: 24,
      tracking: true,
      active: true,
    });
    await admin.saveSite(owner, null, {
      customerId,
      label: 'Main building',
      address: '87 Main Blvd',
      zone: 'Gulberg',
    });
    siteId = (await prisma.fsSite.findFirstOrThrow({ where: { businessId } }))
      .id;
    await admin.equipmentSite(owner, assetId, siteId);
    await expectCode(
      admin.saveSite(owner, null, {
        customerId,
        address: 'x',
        zone: 'Nowhere',
      }),
      'VALIDATION_ERROR',
    );
  });

  it('runs request → triage → convert with duplicate detection and the parts template', async () => {
    const r = await reqs.create(owner, {
      customerId,
      assetId,
      issue: 'Compressor noise',
      priority: 'High',
      channel: 'Phone',
    });
    expect('number' in r && r.number).toBeTruthy();
    const dup = await reqs.create(owner, {
      customerId,
      assetId,
      issue: 'Again',
      priority: 'Normal',
      channel: 'Phone',
    });
    expect(dup).toEqual({ dup: (r as { number: string }).number });
    await reqs.triage(owner, (r as { id: string }).id, {
      result: 'Valid Service Request',
      serviceTypeId: svcId,
    });
    const c = await reqs.convert(owner, (r as { id: string }).id, {
      priority: 'High',
      scope: 'Diagnose compressor noise',
    });
    woId = c.id;
    const w = await prisma.fsWorkOrder.findUniqueOrThrow({
      where: { id: woId },
      include: { parts: true },
    });
    expect([w.status, w.siteId, w.parts.map((p) => p.productId)]).toEqual([
      'Approved',
      siteId,
      [productId],
    ]);
    expect(w.slaDueAt!.getTime()).toBeGreaterThan(Date.now());
    const again = await reqs
      .convert(owner, (r as { id: string }).id, {
        priority: 'High',
        scope: 'x',
      })
      .catch((e: Error) => e);
    expect(again).toBeInstanceOf(Error);
  });

  it('validates assignments and the lifecycle', async () => {
    const d = await wos.load(owner);
    const w = d.wos.find((x) => x.id === woId)!;
    const best = data.suggest(d, w, 1, 10)[0];
    expect([best.t.id, best.e.blocks]).toEqual([ownerId, []]);
    expect(data.elig(d, w, staffId, 1, 10).blocks[0]).toMatch(
      /^TECHNICIAN_SKILL_MISMATCH/,
    );
    await expectCode(
      wos.assign(owner, woId, { tech: staffId, day: 1, h: 10 }),
      'TECHNICIAN_SKILL_MISMATCH',
    );
    await wos.assign(owner, woId, { tech: ownerId, day: 1, h: 10 });
    const reserved = await prisma.fsWoPart.findFirstOrThrow({
      where: { woId },
    });
    expect(reserved.reserved).toBe(1);
    await expectCode(wos.tech(owner, woId, 'Arrived'), 'WO_STATUS_INVALID');
    await wos.dispatch(owner, woId);
    for (const act of ['Start travel', 'Arrived', 'Start job'])
      await wos.tech(owner, woId, act, { key: `k_${woId}_${act}` });
    await wos.tech(owner, woId, 'Start job', { key: `k_${woId}_Start job` });
    expect(
      (await prisma.fsWorkOrder.findUniqueOrThrow({ where: { id: woId } }))
        .status,
    ).toBe('In Progress');
    expect(
      await prisma.fsLabor.count({
        where: { businessId, woId, status: 'Running' },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.fsTechnician.findFirstOrThrow({
          where: { businessId, userId: ownerId },
        })
      ).lastZone,
    ).toBe('Gulberg');
  });

  it('gates completion and moves real stock for parts', async () => {
    await expectCode(
      wos.complete(owner, woId, { resolution: 'done', fixed: true }),
      'VALIDATION_ERROR',
    );
    await wos.upload(owner, woId, 'after', {
      originalname: 'after.png',
      mimetype: 'image/png',
      size: 3,
      buffer: Buffer.from('png'),
    });
    const part = await prisma.fsWoPart.findFirstOrThrow({ where: { woId } });
    await parts.issue(owner, woId, part.id);
    const pr = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(pr.stockQty).toBe(1);
    const mv = await prisma.stockMovement.findFirstOrThrow({
      where: { businessId, productId, kind: 'field_service' },
    });
    expect([mv.qty, num(mv.unitCost)]).toEqual([-1, 1800]);
    await parts.use(owner, woId, part.id, { qty: 1 });
    await wos.sign(owner, woId, { name: 'Imran Butt', ack: true });
    const r = await wos.complete(owner, woId, {
      resolution: 'Capacitor replaced',
      fixed: true,
    });
    expect(r.ok).toBe(true);
    const w = await prisma.fsWorkOrder.findUniqueOrThrow({
      where: { id: woId },
    });
    expect([w.status, w.unresolved]).toEqual(['Completed', false]);
    expect(
      await prisma.fsLabor.count({ where: { woId, status: 'Running' } }),
    ).toBe(0);
  });

  it('invoices through Orders with parts cost left to the stock movement', async () => {
    await wos.invoice(owner, woId);
    const w = await prisma.fsWorkOrder.findUniqueOrThrow({
      where: { id: woId },
    });
    const o = await prisma.order.findUniqueOrThrow({
      where: { id: w.invoiceOrderId! },
      include: { items: true },
    });
    expect([
      o.isQuotation,
      num(o.cogs),
      o.items.length,
      num(o.items[0].price),
    ]).toEqual([false, 0, 1, 2500]);
    await wos.invoice(owner, woId); // retry replays the stored result
    expect(
      await prisma.order.count({ where: { businessId, isQuotation: false } }),
    ).toBe(1);
  });

  it('generates a preventive work order once per period, even when two runs race', async () => {
    await plans.save(owner, null, {
      name: 'Rooftop AC monthly',
      customerId,
      assetId,
      serviceTypeId: svcId,
      trigger: 'Monthly',
      freq: 30,
      firstDueDays: 2,
      autoCreate: true,
      approval: false,
    });
    const p = await prisma.fsPlan.findFirstOrThrow({ where: { businessId } });
    const before = await prisma.fsWorkOrder.count({
      where: { businessId, planId: p.id },
    });
    const d = await wos.load(owner);
    const r = await Promise.allSettled([
      plans.generate(owner, p.id, d),
      plans.generate(owner, p.id, d),
    ]);
    expect(r.some((x) => x.status === 'fulfilled')).toBe(true);
    expect(
      (await prisma.fsWorkOrder.count({
        where: { businessId, planId: p.id },
      })) - before,
    ).toBe(1);
    const p2 = await prisma.fsPlan.findUniqueOrThrow({ where: { id: p.id } });
    expect(p2.nextDueOn!.getTime()).toBeGreaterThan(p.nextDueOn!.getTime());
  });

  it('holds a cancellation for approval when the policy requires it', async () => {
    const s = await ctx.ensure(businessId);
    await admin.save(owner, {
      expectedVersion: s.version,
      config: {
        approvals: {
          ...(await ctx.config(businessId)).approvals,
          cancellation: true,
        },
      },
      reason: 'test',
    });
    const w = await wos.create(owner, {
      customerId,
      serviceTypeId: svcId,
      scope: 'Small job',
      priority: 'Normal',
    });
    const asStaff = { ...staff, workorder: true, techOnly: false };
    const r = await wos.cancel(asStaff, w.id, 'customer fixed it');
    expect('approval' in r && r.approval).toBe(true);
    expect(
      (await prisma.fsWorkOrder.findUniqueOrThrow({ where: { id: w.id } }))
        .status,
    ).toBe('Open');
    const apr = await prisma.fsApproval.findFirstOrThrow({
      where: { businessId, subjectId: w.id },
    });
    await approvals.decide(owner, apr.id, true);
    expect(
      (await prisma.fsWorkOrder.findUniqueOrThrow({ where: { id: w.id } }))
        .status,
    ).toBe('Cancelled');
  });

  it('blocks overlapping manual labor', async () => {
    await labor.manual(owner, {
      tech: ownerId,
      woId,
      type: 'Travel',
      day: -1,
      s: 9,
      e: 10,
      brk: 0,
      billable: false,
      reason: 'forgot timer',
    });
    await expectCode(
      labor.manual(owner, {
        tech: ownerId,
        woId,
        type: 'Repair',
        day: -1,
        s: 9.5,
        e: 11,
        brk: 0,
        billable: true,
        reason: 'x',
      }),
      'VALIDATION_ERROR',
    );
  });

  it('renders every screen, settings section and drawer without NaN / undefined', async () => {
    const bad = /NaN|\bundefined\b|\[object Object\]/;
    for (const [tab] of FS_TABS) {
      const txt = JSON.stringify(
        await views.screen(owner, parseFsScope({ tab, cur: woId })),
      );
      expect([tab, bad.exec(txt)?.[0] ?? '']).toEqual([tab, '']);
    }
    for (const [sec] of FS_SECS) {
      const txt = JSON.stringify(
        await views.screen(owner, parseFsScope({ tab: 'settings', sec })),
      );
      expect([sec, bad.exec(txt)?.[0] ?? '']).toEqual([sec, '']);
    }
    const sc = parseFsScope({});
    const plan = await prisma.fsPlan.findFirstOrThrow({
      where: { businessId },
    });
    const req = await prisma.fsRequest.findFirstOrThrow({
      where: { businessId },
    });
    for (const [k, id] of [
      ['wo', woId],
      ['req', req.id],
      ['tech', ownerId],
      ['report', woId],
      ['opt', '_'],
      ['asset', assetId],
      ['plan', plan.id],
      ['audit', '_'],
      ['approvals', '_'],
      ['kpi', 'o:ftf'],
    ]) {
      const txt = JSON.stringify(await drawers.drawer(owner, sc, k, id));
      expect([k, bad.exec(txt)?.[0] ?? '']).toEqual([k, '']);
    }
    const techView = JSON.stringify(
      await views.screen(staff, parseFsScope({ tab: 'workorders' })),
    );
    expect(techView).not.toContain('Small job');
  });
});
