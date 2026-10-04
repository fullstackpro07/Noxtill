import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { S3Service } from '../common/storage/s3.service';
import type { SystemRoleOverridesService } from '../roles/system-role-overrides.service';
import type { CustomRolesService } from '../roles/custom-roles.service';
import type { FinanceAssetsService } from '../finance/finance-assets.service';
import { AmActor, AmContextService, num } from './am-context.service';
import { AmDataService, parseScope } from './am-data.service';
import { AmSettingsService } from './am-settings.service';
import { AmViewsService } from './am-views.service';
import { AmDrawersService } from './am-drawers.service';
import { AmAssetsService } from './am-assets.service';
import { AmMaintService } from './am-maint.service';
import { AmWorkOrdersService } from './am-workorders.service';
import { AmPmService } from './am-pm.service';
import { AmTaxonomyService } from './am-taxonomy.service';
import { AM_SECS, AM_TABS } from './am.constants';

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
const day = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe('Assets & Maintenance (real DB)', () => {
  const stamp = Date.now();
  let prisma: PrismaService;
  let ctx: AmContextService;
  let data: AmDataService;
  let views: AmViewsService;
  let drawers: AmDrawersService;
  let assets: AmAssetsService;
  let maint: AmMaintService;
  let wos: AmWorkOrdersService;
  let pm: AmPmService;
  let tax: AmTaxonomyService;
  let settings: AmSettingsService;
  let businessId: string;
  let owner: AmActor;
  let staff: AmActor;
  let ownerId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const biz = await prisma.business.create({
      data: {
        name: 'Assets Test Biz',
        slug: `am-test-${stamp}`,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        country: 'PK',
      },
    });
    businessId = biz.id;
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `am-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, s] = await Promise.all([
      mk('Olive Owner', 'o'),
      mk('Sam Staff', 's'),
    ]);
    ownerId = o.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner, hourlyRate: 1000 },
        { businessId, userId: s.id, role: Role.staff },
      ],
    });
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Oil filter',
          costPrice: 1200,
          sellingPrice: 1500,
          stockQty: 3,
        },
      })
    ).id;
    ctx = new AmContextService(prisma, new CapabilitiesService(prisma));
    data = new AmDataService(ctx);
    const overrides = {
      list: () => Promise.resolve([]),
      update: () => Promise.resolve({}),
    } as unknown as SystemRoleOverridesService;
    settings = new AmSettingsService(ctx, overrides, {} as CustomRolesService);
    views = new AmViewsService(ctx, data, settings, {
      accumulated: () => Promise.resolve(new Map()),
    } as unknown as FinanceAssetsService);
    drawers = new AmDrawersService(ctx, data, views);
    assets = new AmAssetsService(ctx, {
      upload: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      getSignedDownloadUrl: () => Promise.resolve('u'),
    } as unknown as S3Service);
    maint = new AmMaintService(ctx);
    wos = new AmWorkOrdersService(ctx, maint);
    pm = new AmPmService(ctx, maint, wos);
    tax = new AmTaxonomyService(ctx);
    const actor = (id: string, role: Role) =>
      ctx.actor({ sub: id, businessId, role } as AuthenticatedUser);
    owner = await actor(o.id, Role.owner);
    staff = await actor(s.id, Role.staff);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'am_settings',
        'am_settings_versions',
        'am_categories',
        'am_locations',
        'am_teams',
        'am_pm_templates',
        'am_custom_fields',
        'am_assets',
        'am_documents',
        'am_readings',
        'am_requests',
        'am_work_orders',
        'am_pm_plans',
        'am_events',
        'am_downtime',
        'am_audit',
        'am_saved_views',
        'am_insight_dismissals',
        'stock_movements',
        'products',
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

  it('gives staff view/request/reading only and the owner everything', () => {
    expect(owner.create && owner.approve && owner.cost && owner.settings).toBe(
      true,
    );
    expect(staff.request && staff.reading).toBe(true);
    expect(staff.create || staff.cost || staff.approve).toBe(false);
  });

  it('creates assets with numbering, category defaults and duplicate / version checks', async () => {
    const cat = await tax.saveCategory(owner, null, {
      name: 'Power',
      code: 'PWR',
      criticality: 'Critical',
    });
    const a = await assets.create(owner, {
      name: 'Generator',
      categoryId: cat.id,
      serial: 'S-1',
      tag: 'T-1',
      meterType: 'Hours',
      initialReading: 100,
    });
    expect(a.number).toBe('AST-0001');
    expect(a.criticality).toBe('Critical');
    await expectCode(
      assets.create(owner, { name: 'Copy', serial: 'S-1', dupOk: true }),
      'DUPLICATE_ASSET',
    );
    await expectCode(
      assets.create(owner, { name: 'Copy', tag: 'T-1' }),
      'DUPLICATE_ASSET',
    );
    await expectCode(
      assets.create(staff, { name: 'Nope' }),
      'PERMISSION_DENIED',
    );
    const e = await assets.update(owner, a.id, {
      condition: 'Fair',
      expectedVersion: a.version,
    });
    expect(e.version).toBe(a.version + 1);
    await expectCode(
      assets.update(owner, a.id, {
        condition: 'Poor',
        expectedVersion: a.version,
      }),
      'VERSION_CONFLICT',
    );
    await expectCode(
      assets.archive(owner, a.id, 'x'),
      'INVALID_STATUS_TRANSITION',
    );
    expect(
      await prisma.amEvent.count({
        where: { assetId: a.id, type: 'Condition Change' },
      }),
    ).toBe(1);
  });

  it('keeps meter readings append-only and rejects impossible values', async () => {
    const a = await prisma.amAsset.findFirstOrThrow({
      where: { businessId, number: 'AST-0001' },
    });
    await expectCode(
      maint.recordReading(owner, { assetId: a.id, value: 50 }),
      'INVALID_METER_READING',
    );
    await expectCode(
      maint.recordReading(owner, { assetId: a.id, value: 99999 }),
      'INVALID_METER_READING',
    );
    const r = await maint.recordReading(owner, { assetId: a.id, value: 105 });
    await maint.correctReading(owner, r.reading.id, {
      value: 104,
      reason: 'typo',
    });
    await expectCode(
      maint.correctReading(owner, r.reading.id, { value: 103, reason: 'x' }),
      'ASSETS_CONFLICT',
    );
    expect(await prisma.amReading.count({ where: { assetId: a.id } })).toBe(3);
  });

  it('runs request → convert → start → issue parts → complete with real stock, labor and downtime', async () => {
    const a = await prisma.amAsset.findFirstOrThrow({
      where: { businessId, number: 'AST-0001' },
    });
    const rq = await maint.createRequest(owner, {
      assetId: a.id,
      title: 'Vibration',
      issueType: 'Noise/Vibration',
      priority: 'High',
      operational: false,
    });
    expect(
      await prisma.amDowntime.count({ where: { assetId: a.id, endAt: null } }),
    ).toBe(1);
    const cv = await wos.convert(owner, rq.id, {
      due: day(2),
      parts: [{ productId, qty: 5 }],
      expectedDownH: 2,
      checklist: ['Fix'],
    });
    const wo = cv.wo;
    await expectCode(
      wos.move(owner, wo.id, 'Start'),
      'INVALID_STATUS_TRANSITION',
    );
    if (cv.draft) await wos.move(owner, wo.id, 'Approve');
    await wos.assign(owner, wo.id, `u:${ownerId}`);
    await wos.move(owner, wo.id, 'Start');
    const iss = await wos.issueParts(owner, wo.id);
    expect(iss.short.length).toBe(1);
    const p = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(p.stockQty).toBe(0);
    const mv = await prisma.stockMovement.findFirstOrThrow({
      where: { productId, kind: 'maintenance' },
    });
    expect(mv.qty).toBe(-3);
    expect(num(mv.unitCost)).toBe(1200);
    await expectCode(wos.issueParts(owner, wo.id), 'PART_NOT_AVAILABLE');
    const res = await wos.complete(owner, wo.id, {
      outcome: 'Resolved',
      work: 'Fixed',
      condition: 'Good',
      laborHours: 2,
      endDowntime: true,
      statusAfter: 'Active',
    });
    expect(res.downtimeEnded).toBe(true);
    const done = await wos.must(businessId, wo.id);
    expect(done.status).toBe('Completed');
    expect(done.costs.find((c) => c.type === 'Labor')?.amount.toString()).toBe(
      '2000',
    );
    expect(
      done.costs
        .filter((c) => c.type === 'Parts')
        .reduce((s, c) => s + num(c.amount), 0),
    ).toBe(3600);
    expect(done.parts[0].used).toBe(3);
    expect(
      (await prisma.amRequest.findUniqueOrThrow({ where: { id: rq.id } }))
        .status,
    ).toBe('Converted');
  });

  it('generates exactly one PM work order per due instance and blocks retirement while it is open', async () => {
    const a = await assets.create(owner, { name: 'UPS', criticality: 'High' });
    const p = await pm.create(owner, {
      name: 'UPS check',
      assetId: a.id,
      trigger: 'Time',
      interval: 1,
      unit: 'months',
      nextDueOn: day(-1),
      autoCreate: true,
      leadDays: 7,
    });
    const g = await pm.generateManual(owner, p.id);
    expect(g.number).toMatch(/^MWO-/);
    await expectCode(
      pm.generateManual(owner, p.id),
      'DUPLICATE_PM_DUE_INSTANCE',
    );
    const ev = await pm.evaluate(businessId);
    expect(ev.made).toHaveLength(0);
    expect(await prisma.amWorkOrder.count({ where: { pmPlanId: p.id } })).toBe(
      1,
    );
    await expectCode(
      assets.retire(owner, a.id, {
        to: 'Retired',
        date: day(0),
        reason: 'old',
      }),
      'ASSETS_CONFLICT',
    );
    await wos.move(owner, g.id, 'Cancel', 'not needed');
    // Cancelling releases the instance, so the evaluator can generate it again.
    expect((await pm.evaluate(businessId)).made).toHaveLength(1);
  });

  it('guards taxonomy deletes, deactivation and settings validation', async () => {
    const cat = await prisma.amCategory.findFirstOrThrow({
      where: { businessId, code: 'PWR' },
    });
    await expectCode(
      tax.categoryAction(owner, cat.id, 'Delete'),
      'ASSETS_CONFLICT',
    );
    const loc = await tax.saveLocation(owner, null, {
      name: 'Roof',
      code: 'RF',
      type: 'Area',
      parent: `b:${businessId}`,
    });
    const a = await prisma.amAsset.findFirstOrThrow({
      where: { businessId, number: 'AST-0001' },
    });
    await assets.transfer(owner, a.id, {
      locationId: loc.id,
      effective: day(0),
      reason: 'moved',
    });
    await expectCode(
      tax.locationAction(owner, loc.id, 'Deactivate'),
      'ASSETS_CONFLICT',
    );
    const s = await ctx.ensure(businessId);
    await expectCode(
      settings.save(owner, {
        expectedVersion: s.version,
        config: { statuses: { allowed: ['Active'] } },
      }),
      'ASSETS_INVALID',
    );
    await expectCode(
      settings.save(owner, {
        expectedVersion: s.version,
        config: { meters: ['Kilometers'] },
      }),
      'ASSETS_CONFLICT',
    );
    const r = await settings.save(owner, {
      expectedVersion: s.version,
      config: {
        pm: {
          lead: 9,
          auto: true,
          reminder: '3 days before due',
          tolerance: '±3 days',
        },
      },
    });
    expect(r.version).toBe(s.version + 1);
    await expectCode(
      settings.save(staff, { expectedVersion: r.version, config: {} }),
      'PERMISSION_DENIED',
    );
  });

  it('renders every tab, settings section and drawer from real rows with no broken values', async () => {
    const bad = /NaN|undefined|\[object Object\]|Infinity/;
    const a = await prisma.amAsset.findFirstOrThrow({
      where: { businessId, number: 'AST-0001' },
    });
    await maint.inspect(owner, {
      assetId: a.id,
      result: 'Fail',
      findings: 'vibration again',
      critical: true,
    });
    for (const [tab] of AM_TABS) {
      const secs =
        tab === 'settings' ? AM_SECS.map((x) => x[0]) : ['numbering'];
      for (const sec of secs) {
        const txt = JSON.stringify(
          await views.screen(owner, parseScope({ tab, sec, cur: a.id })),
        );
        expect([tab, sec, bad.exec(txt)?.[0] ?? '']).toEqual([tab, sec, '']);
      }
    }
    for (const dt of [
      'overview',
      'maint',
      'insp',
      'meter',
      'down',
      'costs',
      'docs',
      'rel',
      'tl',
      'audit',
    ]) {
      const txt = JSON.stringify(
        await views.screen(
          owner,
          parseScope({
            tab: 'detail',
            cur: a.id,
            seg: JSON.stringify({ d: dt }),
          }),
        ),
      );
      expect([dt, bad.exec(txt)?.[0] ?? '']).toEqual([dt, '']);
    }
    const ov = JSON.stringify(
      await views.screen(owner, parseScope({ tab: 'overview' })),
    );
    expect(ov).toContain('Average Asset Health');
    const an = JSON.stringify(
      await views.screen(owner, parseScope({ tab: 'analytics' })),
    );
    expect(an).toContain('Recurring vibration finding');
    // Staff never receive cost values.
    const st = JSON.stringify(
      await views.screen(
        staff,
        parseScope({
          tab: 'workorders',
          f: JSON.stringify({ wo: { st: '' } }),
        }),
      ),
    );
    expect(st).not.toMatch(/Rs\. 3,600/);
    const sc = parseScope({ tab: 'overview' });
    const wo = await prisma.amWorkOrder.findFirstOrThrow({
      where: { businessId, requestId: { not: null } },
    });
    const rq = await prisma.amRequest.findFirstOrThrow({
      where: { businessId },
    });
    const plan = await prisma.amPmPlan.findFirstOrThrow({
      where: { businessId },
    });
    const ev = await prisma.amEvent.findFirstOrThrow({
      where: { businessId, type: 'Inspection' },
    });
    const kinds: [string, string, string?][] = [
      ['asset', a.id],
      ['req', rq.id],
      ['pm', plan.id],
      ['hist', ev.id],
      ['fresh', '_'],
      ['audit', '_'],
      ...[
        'overview',
        'checklist',
        'parts',
        'labor',
        'downtime',
        'costs',
        'timeline',
      ].map((t): [string, string, string] => ['wo', wo.id, t]),
      ...[
        'k-health',
        'k-due',
        'k-od',
        'k-down',
        'k-cost',
        'k-wty',
        'r-noloc',
        'a-rep',
        'down:all',
      ].map((k): [string, string] => ['list', k]),
    ];
    for (const [k, id, t] of kinds) {
      const txt = JSON.stringify(await drawers.drawer(owner, sc, k, id, t));
      expect([k, t ?? id, bad.exec(txt)?.[0] ?? '']).toEqual([k, t ?? id, '']);
    }
  });
});
