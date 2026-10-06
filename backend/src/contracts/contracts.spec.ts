import { Role } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { S3Service } from '../common/storage/s3.service';
import type { EmailService } from '../messaging/channels/email.service';
import type { ProjectTasksService } from '../projects/project-tasks.service';
import { CtActor, CtContextService } from './ct-context.service';
import { CtDataService, parseCtScope } from './ct-data.service';
import { CtFilesService } from './ct-files.service';
import { CtApprovalsService } from './ct-approvals.service';
import { CtDocsService } from './ct-docs.service';
import { CtTemplatesService } from './ct-templates.service';
import { CtContractsService } from './ct-contracts.service';
import { CtEsignService } from './ct-esign.service';
import { CtComplianceService } from './ct-compliance.service';
import { CtSettingsService } from './ct-settings.service';
import { CtViewsService } from './ct-views.service';
import { CtDrawersService } from './ct-drawers.service';
import { ContractsProcessor } from './contracts.processor';
import { CT_SECS, CT_TABS } from './ct.constants';

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
const iso = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('Contracts (real DB)', () => {
  jest.setTimeout(90_000);
  const stamp = Date.now();
  const store = new Map<string, Buffer>();
  const mails: { to: string; text: string }[] = [];
  let prisma: PrismaService;
  let ctx: CtContextService;
  let data: CtDataService;
  let docs: CtDocsService;
  let tpls: CtTemplatesService;
  let cts: CtContractsService;
  let apr: CtApprovalsService;
  let esign: CtEsignService;
  let comp: CtComplianceService;
  let settings: CtSettingsService;
  let views: CtViewsService;
  let drawers: CtDrawersService;
  let proc: ContractsProcessor;
  let businessId: string;
  let owner: CtActor;
  let manager: CtActor;
  let staff: CtActor;
  let ownerId: string;
  let managerId: string;
  let customerId: string;
  let tplId = '';
  let ctId = '';
  let ctNumber = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Contracts Test Biz',
          slug: `ct-test-${stamp}`,
          currency: 'PKR',
          timezone: 'Asia/Karachi',
          country: 'PK',
          address: '12 Mall Road, Lahore',
        },
      })
    ).id;
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `ct-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, m, s] = await Promise.all([
      mk('Maya Owner', 'o'),
      mk('Omar Manager', 'm'),
      mk('Usman Staff', 's'),
    ]);
    ownerId = o.id;
    managerId = m.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner },
        { businessId, userId: m.id, role: Role.manager },
        { businessId, userId: s.id, role: Role.staff },
      ],
    });
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Aziz Traders',
          email: `aziz-${stamp}@example.com`,
          phone: `+92301${String(stamp).slice(-7)}`,
        },
      })
    ).id;

    const caps = new CapabilitiesService(prisma);
    ctx = new CtContextService(prisma, caps);
    data = new CtDataService(ctx);
    const s3 = {
      upload: (k: string, b: Buffer) => (store.set(k, b), Promise.resolve()),
      readObject: (k: string) => Promise.resolve(store.get(k) ?? null),
      delete: (k: string) => (store.delete(k), Promise.resolve()),
      getSignedDownloadUrl: (k: string) => Promise.resolve(`signed://${k}`),
    } as unknown as S3Service;
    const email = {
      send: (p: { to: string; text: string }) => (
        mails.push(p),
        Promise.resolve({ providerRef: 'test' })
      ),
    } as unknown as EmailService;
    const config = {
      get: (k: string) =>
        k === 'FRONTEND_URL' ? 'http://app.test' : undefined,
    } as unknown as ConfigService;
    const files = new CtFilesService(s3);
    apr = new CtApprovalsService(ctx);
    docs = new CtDocsService(ctx, files, apr, caps, email);
    tpls = new CtTemplatesService(ctx, apr);
    cts = new CtContractsService(
      ctx,
      files,
      apr,
      tpls,
      {} as ProjectTasksService,
      email,
    );
    esign = new CtEsignService(ctx, files, email, config);
    comp = new CtComplianceService(ctx, docs);
    settings = new CtSettingsService(ctx, config);
    views = new CtViewsService(ctx, data, settings);
    drawers = new CtDrawersService(ctx, data, views, tpls);
    proc = new ContractsProcessor(ctx, esign);
    const actor = (id: string, role: Role) =>
      ctx.actor({ sub: id, businessId, role } as AuthenticatedUser);
    owner = await actor(o.id, Role.owner);
    manager = await actor(m.id, Role.manager);
    staff = await actor(s.id, Role.staff);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const [child, parent, fk] of [
        ['ct_doc_versions', 'ct_documents', 'doc_id'],
        ['ct_template_versions', 'ct_templates', 'template_id'],
        ['ct_terms', 'ct_contracts', 'contract_id'],
        ['ct_obligations', 'ct_contracts', 'contract_id'],
        ['ct_amendments', 'ct_contracts', 'contract_id'],
        ['ct_signers', 'ct_sign_requests', 'request_id'],
        ['ct_sign_events', 'ct_sign_requests', 'request_id'],
        ['ct_acks', 'ct_compliance', 'compliance_id'],
      ])
        await tx.$executeRawUnsafe(
          `DELETE c FROM ${child} c JOIN ${parent} p ON p.id = c.${fk} WHERE p.business_id = ?`,
          businessId,
        );
      for (const t of [
        'ct_settings',
        'ct_settings_versions',
        'ct_documents',
        'ct_templates',
        'ct_contracts',
        'ct_sign_requests',
        'ct_approvals',
        'ct_compliance',
        'ct_expiry_states',
        'ct_audit',
        'ct_idem',
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

  it('gives the owner every right; staff see documents/compliance but not contracts', () => {
    expect(
      owner.manage &&
        owner.approve &&
        owner.terminate &&
        owner.restricted &&
        owner.contracts,
    ).toBe(true);
    expect(manager.approve && manager.contracts).toBe(true);
    expect(staff.contracts).toBe(false);
    expect(staff.upload).toBe(true);
    expect(views.allowed(staff, 'contracts')).toBe(false);
    expect(views.allowed(staff, 'compliance')).toBe(true);
  });

  it('rejects unsafe or unknown template variables and publishes a clean template', async () => {
    await expectCode(
      tpls.save(owner, null, {
        name: 'Bad',
        content: 'Hello {{ process.env }}',
      }),
      'VALIDATION_ERROR',
    );
    await expectCode(
      tpls.save(owner, null, {
        name: 'Bad',
        content: 'Hello {{customer.shoe_size}}',
      }),
      'VALIDATION_ERROR',
    );
    const t = await tpls.save(owner, null, {
      name: 'Service agreement',
      type: 'Service Agreement',
      content:
        'Agreement {{contract.number}} between {{business.name}} and {{customer.name}} from {{contract.start_date}}. Payment terms: {{payment.terms}}.',
      roles: ['Business Signatory', 'Customer'],
      approval: 'None',
    });
    tplId = t.id;
    expect(t.number).toMatch(/^TPL-/);
    expect((await tpls.publish(owner, tplId)).status).toBe('Published');
    // Editing a published template starts a new draft version; v1 stays published.
    const e = await tpls.save(owner, tplId, {
      name: 'Service agreement',
      type: 'Service Agreement',
      content: 'v2 {{business.name}}',
      roles: [],
      approval: 'None',
    });
    expect(e.version).toBe(2);
    const vs = await prisma.ctTemplateVersion.findMany({
      where: { templateId: tplId },
      orderBy: { version: 'asc' },
    });
    expect(vs.map((v) => v.status)).toEqual(['Published', 'Draft']);
  });

  it('creates a contract from the template, refusing variables no record holds', async () => {
    const base = {
      src: 'tpl',
      templateId: tplId,
      title: 'Aziz annual service',
      type: 'Service Agreement',
      cp: `customer:${customerId}`,
      start: iso(1),
      end: iso(366),
      notice: 30,
      value: 200000,
    };
    await expectCode(cts.create(owner, base, null), 'VALIDATION_ERROR');
    const pv = await cts.preview(owner, base);
    expect(pv.open).toEqual(['payment.terms']);
    expect(pv.text).toContain('Aziz Traders');
    expect(pv.text).toContain('Contracts Test Biz');
    const r = await cts.create(
      owner,
      {
        ...base,
        body: pv.text.replace('{{payment.terms}}', '30 days net'),
        signer: 'Aziz Khan',
        email: `signer-${stamp}@example.com`,
      },
      null,
    );
    ctId = r.id;
    ctNumber = r.number;
    expect(r.number).toMatch(
      new RegExp(`^CTR-${new Date().getUTCFullYear()}-\\d{6}$`),
    );
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    expect(c.status).toBe('Draft');
    const v = await prisma.ctDocVersion.findFirstOrThrow({
      where: { docId: c.docId! },
    });
    expect(v.text).toContain(r.number);
    expect(v.text).toContain('30 days net');
    expect(v.sha256).toHaveLength(64);
    expect(store.has(v.storageKey!)).toBe(true);
  });

  it('refuses a stale edit with VERSION_CONFLICT and saves a current one', async () => {
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    await cts.edit(owner, ctId, {
      title: 'Aziz annual service',
      end: iso(366),
      notice: 30,
      value: 250000,
      ownerId,
      expectedVersion: c.version,
    });
    await expectCode(
      cts.edit(owner, ctId, {
        title: 'Stale',
        end: iso(366),
        notice: 45,
        value: 1,
        ownerId,
        expectedVersion: c.version,
      }),
      'VERSION_CONFLICT',
    );
    expect(
      (await prisma.ctContract.findUniqueOrThrow({ where: { id: ctId } }))
        .noticeDays,
    ).toBe(30);
  });

  it('blocks sending for signature before approval', async () => {
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    await expectCode(
      esign.prepare(owner, {
        docId: c.docId!,
        signers: [{ name: 'X', email: 'x@example.com', role: 'Customer' }],
      }),
      'APPROVAL_REQUIRED',
    );
  });

  it('runs approval with four-eyes, delegation and locks the approved version', async () => {
    const s = await cts.submit(owner, ctId, 'Annual renewal of service');
    expect(s.status).toBe('Pending');
    const a = await prisma.ctApproval.findFirstOrThrow({
      where: { businessId, entityId: ctId },
    });
    const steps = a.steps as { role: string; userId: string; status: string }[];
    expect(steps[0]).toMatchObject({
      role: 'Contract Owner',
      status: 'Approved',
    });
    expect(steps[1]).toMatchObject({
      role: 'Authorized Signatory',
      userId: ownerId,
      status: 'Pending',
    });
    await expectCode(
      apr.decide(owner, a.id, 'Approve', '', null),
      'PERMISSION_DENIED',
    );
    await expectCode(
      apr.decide(manager, a.id, 'Approve', '', null),
      'PERMISSION_DENIED',
    );
    await apr.decide(owner, a.id, 'Delegate', 'Please sign off', managerId);
    const r = await apr.decide(manager, a.id, 'Approve', 'OK', null);
    expect(r.status).toBe('Approved');
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    expect(c.status).toBe('Approved');
    expect(c.aprState).toBe('Approved');
    const v = await prisma.ctDocVersion.findFirstOrThrow({
      where: { docId: c.docId! },
    });
    expect(v.immutable).toBe(true);
  });

  it('signs sequentially through tokenised links and activates the contract', async () => {
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    mails.length = 0;
    const r = await esign.prepare(owner, {
      docId: c.docId!,
      signers: [
        {
          name: 'Maya Owner',
          email: `maya-${stamp}@example.com`,
          role: 'Business Signatory',
        },
        {
          name: 'Aziz Khan',
          email: `signer-${stamp}@example.com`,
          role: 'Customer',
        },
      ],
      order: 'Sequential',
      auth: 'Email',
      send: true,
    });
    expect(mails).toHaveLength(1);
    const tok = (i: number) =>
      /\/sign\/([A-Za-z0-9_-]+)/.exec(mails[i].text)![1];
    await expectCode(
      esign.prepare(owner, {
        docId: c.docId!,
        signers: [{ name: 'Y', email: 'y@example.com' }],
      }),
      'DUPLICATE_OPERATION',
    );
    const view = await esign.view(tok(0), '10.0.0.1', 'jest');
    expect(view.blocked).toBeNull();
    expect(view.text).toContain(ctNumber);
    await expectCode(
      esign.sign(
        tok(0),
        { sigType: 'Typed', sigData: 'Maya Owner', agree: false },
        null,
        null,
      ),
      'VALIDATION_ERROR',
    );
    expect(
      (
        await esign.sign(
          tok(0),
          { sigType: 'Typed', sigData: 'Maya Owner', agree: true },
          '10.0.0.1',
          'jest',
        )
      ).completed,
    ).toBe(false);
    expect(mails).toHaveLength(2);
    expect(
      (await prisma.ctContract.findUniqueOrThrow({ where: { id: ctId } }))
        .status,
    ).toBe('Partially Signed');
    await expectCode(
      esign.sign(
        tok(0),
        { sigType: 'Typed', sigData: 'Again', agree: true },
        null,
        null,
      ),
      'INVALID_STATUS_TRANSITION',
    );
    expect(
      (
        await esign.sign(
          tok(1),
          { sigType: 'Typed', sigData: 'Aziz Khan', agree: true },
          '10.0.0.2',
          'jest',
        )
      ).completed,
    ).toBe(true);
    const done = await prisma.ctSignRequest.findFirstOrThrow({
      where: { businessId, number: r.number },
      include: { signers: true },
    });
    expect(done.status).toBe('Completed');
    expect(done.signers.every((x) => x.status === 'Signed' && x.ip)).toBe(true);
    const after = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    expect(after.status).toBe('Active');
    expect(after.sigState).toBe('Completed');
    expect(
      (
        await prisma.ctDocVersion.findFirstOrThrow({
          where: { docId: c.docId! },
        })
      ).state,
    ).toBe('Signed');
  });

  it('refuses deleting a document a contract depends on', async () => {
    const c = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    await expectCode(
      docs.remove(owner, c.docId!, 'cleanup'),
      'RETENTION_BLOCK',
    );
  });

  it('enforces OTP policy above the configured value', async () => {
    await settings.save(owner, {
      ...(await ctx.config(businessId)),
      auth: {
        methods: ['Email', 'Email + OTP'],
        otpAbove: 100,
        otpEmployees: true,
      },
    });
    const d = await cts.create(
      owner,
      {
        src: 'blank',
        title: 'OTP test',
        type: 'NDA',
        cp: `customer:${customerId}`,
        start: iso(1),
        end: iso(200),
        notice: 10,
        value: 5000,
        body: 'NDA between {{business.name}} and {{counterparty.name}}.',
      },
      null,
    );
    await prisma.ctContract.update({
      where: { id: d.id },
      data: { status: 'Approved' },
    });
    const doc = (
      await prisma.ctContract.findUniqueOrThrow({ where: { id: d.id } })
    ).docId!;
    await expectCode(
      esign.prepare(owner, {
        docId: doc,
        signers: [{ name: 'A', email: 'a@example.com' }],
        auth: 'Email',
      }),
      'VALIDATION_ERROR',
    );
    mails.length = 0;
    await esign.prepare(owner, {
      docId: doc,
      signers: [
        { name: 'A', email: `a-${stamp}@example.com`, role: 'Customer' },
      ],
      auth: 'Email + OTP',
      send: true,
    });
    const t = /\/sign\/([A-Za-z0-9_-]+)/.exec(mails[0].text)![1];
    await expectCode(
      esign.sign(
        t,
        { sigType: 'Typed', sigData: 'A A', agree: true },
        null,
        null,
      ),
      'SIGNATURE_INVALID',
    );
    await esign.sendOtp(t);
    const code = /code is (\d{6})/.exec(mails[1].text)![1];
    await expectCode(
      esign.sign(
        t,
        {
          sigType: 'Typed',
          sigData: 'A A',
          otp: '000000' === code ? '111111' : '000000',
          agree: true,
        },
        null,
        null,
      ),
      'SIGNATURE_INVALID',
    );
    expect(
      (
        await esign.sign(
          t,
          { sigType: 'Typed', sigData: 'A A', otp: code, agree: true },
          null,
          null,
        )
      ).completed,
    ).toBe(true);
  });

  it('renews into a new draft, keeps the original, and terminates only with typed confirmation', async () => {
    const r = await cts.renew(owner, ctId, iso(800), 'Price +5%');
    const n = await prisma.ctContract.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(n.renewalOf).toBe(ctId);
    expect(n.status).toBe('Draft');
    const o = await prisma.ctContract.findUniqueOrThrow({
      where: { id: ctId },
    });
    expect(o.renewState).toBe('Renewal Draft');
    await expectCode(
      cts.renew(owner, ctId, iso(900), ''),
      'DUPLICATE_OPERATION',
    );
    await expectCode(
      cts.terminate(owner, ctId, iso(60), 'Closing', 'terminate'),
      'VALIDATION_ERROR',
    );
    await expectCode(
      cts.terminate(owner, ctId, iso(1), 'Closing', 'TERMINATE'),
      'VALIDATION_ERROR',
    );
  });

  it('expires or auto-renews contracts by date in the hourly run', async () => {
    const mk = async (auto: boolean) => {
      const d = await cts.create(
        owner,
        {
          src: 'blank',
          title: `Dated ${auto}`,
          type: 'Lease',
          cp: `customer:${customerId}`,
          start: iso(1),
          end: iso(100),
          notice: 0,
          body: 'Lease with {{counterparty.name}}.',
        },
        null,
      );
      await prisma.ctContract.update({
        where: { id: d.id },
        data: {
          status: 'Active',
          autoRenew: auto,
          startOn: new Date(`${iso(-400)}T00:00:00Z`),
          endOn: new Date(`${iso(-35)}T00:00:00Z`),
        },
      });
      return d.id;
    };
    const a = await mk(true);
    const e = await mk(false);
    await proc.run(businessId);
    const A = await prisma.ctContract.findUniqueOrThrow({ where: { id: a } });
    expect(A.status).toBe('Active');
    expect(A.endOn!.getTime()).toBeGreaterThan(Date.now());
    expect(
      (await prisma.ctContract.findUniqueOrThrow({ where: { id: e } })).status,
    ).toBe('Expired');
    // Settings › Retention archives contracts that ended over 30 days ago — on the next run.
    expect((await proc.run(businessId)).moved).toBe(1);
    expect(
      (await prisma.ctContract.findUniqueOrThrow({ where: { id: e } })).status,
    ).toBe('Archived');
    expect((await proc.run(businessId)).moved).toBe(0);
  });

  it('tracks compliance acknowledgements per version for staff', async () => {
    const x = await comp.create(
      owner,
      {
        title: 'Code of conduct',
        type: 'Policy',
        audience: 'All staff',
        ack: true,
      },
      {
        originalname: 'coc.txt',
        mimetype: 'text/plain',
        size: 12,
        buffer: Buffer.from('Be excellent'),
      },
    );
    expect(x.doc).toMatch(/^DOC-/);
    const n = (await comp.publish(owner, x.id)).requested;
    expect(n).toBe(3);
    await comp.acknowledge(staff, x.id);
    const d = await data.load(owner, parseCtScope({}));
    const rec = d.comp.find((y) => y.id === x.id)!;
    expect(data.ackTotals(d, rec)).toEqual({ tot: 3, done: 1 });
    expect(data.cmpSt(d, rec)).toBe('Acknowledgement Pending');
    await expectCode(
      comp.create(
        owner,
        { title: 'Supplier code', audience: 'Suppliers', ack: true },
        null,
      ),
      'VALIDATION_ERROR',
    );
  });

  it('renders every screen, settings section and drawer without broken values', async () => {
    const bad = /NaN|undefined|\[object Object\]|Invalid Date/;
    for (const [tab] of CT_TABS) {
      const scr = await views.screen(
        owner,
        parseCtScope({ tab, cur: ctNumber }),
      );
      expect(JSON.stringify(scr)).not.toMatch(bad);
    }
    for (const [sec] of CT_SECS)
      expect(
        JSON.stringify(
          await views.screen(owner, parseCtScope({ tab: 'settings', sec })),
        ),
      ).not.toMatch(bad);
    for (const dTab of [
      'ov',
      'doc',
      'parties',
      'terms',
      'obl',
      'apr',
      'sig',
      'amend',
      'renew',
      'rel',
      'act',
      'audit',
    ])
      expect(
        JSON.stringify(
          await views.screen(
            owner,
            parseCtScope({
              tab: 'detail',
              cur: ctNumber,
              view: JSON.stringify({ dTab }),
            }),
          ),
        ),
      ).not.toMatch(bad);
    const d = await data.load(owner, parseCtScope({}));
    const s = parseCtScope({});
    const ids: [string, string][] = [
      ['doc', d.docs[0].id],
      ['sig', d.sigs[0].id],
      ['evidence', d.sigs[0].id],
      ['apr', d.approvals[0].id],
      ['cmp', d.comp[0].id],
      ['tplprev', tplId],
      ['tplhist', tplId],
      ['ct', ctId],
      ['vars', '_'],
      ['storage', '_'],
      ['audit', '_'],
      ...data
        .expiries(d)
        .slice(0, 2)
        .map((e) => ['exp', e.id] as [string, string]),
    ];
    for (const [k, id] of ids)
      expect(JSON.stringify(await drawers.drawer(owner, s, k, id))).not.toMatch(
        bad,
      );
    const staffScr = await views.screen(
      staff,
      parseCtScope({ tab: 'contracts' }),
    );
    expect(staffScr.gate).toBeTruthy();
  });
});
