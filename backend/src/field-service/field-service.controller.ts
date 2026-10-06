import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { FsContextService, fsErr } from './fs-context.service';
import { parseFsScope } from './fs-data.service';
import { FsViewsService } from './fs-views.service';
import { FsDrawersService } from './fs-drawers.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FsRequestsService, RequestIn } from './fs-requests.service';
import { FsPartsService } from './fs-parts.service';
import { FsLaborService } from './fs-labor.service';
import { FsPlansService } from './fs-plans.service';
import { FsCasesService } from './fs-cases.service';
import { FsAdminService } from './fs-admin.service';
import { FsApprovalsService } from './fs-approvals.service';
import { FsDocsService } from './fs-docs.service';
import { FS_ERRORS } from './fs.constants';
import {
  ActiveDto,
  AddPartDto,
  AgreementDto,
  AssignDto,
  BulkDto,
  CaseDto,
  ChecklistDto,
  CompleteDto,
  ConvertDto,
  DecideDto,
  EquipmentSiteDto,
  FormDataDto,
  FsScopeQuery,
  LaborActDto,
  LaborDto,
  LockDto,
  NoteDto,
  PlanDto,
  PreviewDto,
  PriorityDto,
  ProcureDto,
  ReasonDto,
  RejectDto,
  ReportDto,
  ScheduleDto,
  ServiceTypeDto,
  SettingsDiffDto,
  SettingsDto,
  SignDto,
  SiteDto,
  StageDto,
  SummaryDto,
  SuspendDto,
  TechActDto,
  TechStatusDto,
  TechnicianDto,
  TemplateActDto,
  TemplateDto,
  TextDto,
  TriageDto,
  UsePartDto,
  VersionDto,
  WoDto,
  WrnRejectDto,
} from './dto/fs.dto';

type Upload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/** Field Service API. Auth/tenancy are global; field rights are checked per action in the services. */
@Controller('field-service')
export class FieldServiceController {
  constructor(
    private readonly ctx: FsContextService,
    private readonly views: FsViewsService,
    private readonly drawers: FsDrawersService,
    private readonly wos: FsWorkOrdersService,
    private readonly reqs: FsRequestsService,
    private readonly parts: FsPartsService,
    private readonly labor: FsLaborService,
    private readonly plans: FsPlansService,
    private readonly cases: FsCasesService,
    private readonly admin: FsAdminService,
    private readonly approvals: FsApprovalsService,
    private readonly docs: FsDocsService,
  ) {}

  private actor(u: AuthenticatedUser) {
    return this.ctx.actor(u);
  }

  // ── reads ──────────────────────────────────────────────────────────────

  @Get('screen')
  async screen(@CurrentUser() u: AuthenticatedUser, @Query() q: FsScopeQuery) {
    return this.views.screen(
      await this.actor(u),
      parseFsScope(q as Record<string, unknown>),
    );
  }

  @Get('drawer/:kind/:id')
  async drawer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: FsScopeQuery,
  ) {
    return this.drawers.drawer(
      await this.actor(u),
      parseFsScope(q as Record<string, unknown>),
      kind,
      id,
    );
  }

  /** Pick-lists for modals — every option is a real record. */
  @Get('options')
  async options(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    const db = this.ctx.db;
    const group = await this.ctx.branches(a.rootId);
    const gids = group.map((g) => g.id);
    const [
      cfg,
      s,
      svc,
      tpls,
      techs,
      sites,
      eq,
      eqSites,
      customers,
      products,
      services,
      suppliers,
      members,
      wos,
    ] = await Promise.all([
      this.ctx.config(a.rootId),
      this.ctx.ensure(a.rootId),
      db.fsServiceType.findMany({
        where: { businessId: a.rootId },
        orderBy: { code: 'asc' },
      }),
      db.fsTemplate.findMany({
        where: { businessId: a.rootId },
        select: {
          id: true,
          code: true,
          name: true,
          version: true,
          status: true,
          serviceTypeId: true,
        },
        orderBy: [{ code: 'asc' }, { version: 'asc' }],
      }),
      db.fsTechnician.findMany({
        where: { businessId: a.rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.fsSite.findMany({
        where: { businessId: a.rootId, active: true },
        orderBy: { label: 'asc' },
      }),
      db.amAsset.findMany({
        where: {
          businessId: a.rootId,
          ownerType: 'Customer-owned',
          status: { notIn: ['Archived', 'Disposed', 'Retired'] },
        },
        select: {
          id: true,
          number: true,
          name: true,
          serial: true,
          customerId: true,
          meterType: true,
          categoryId: true,
        },
        orderBy: { number: 'asc' },
      }),
      db.fsEquipmentSite.findMany({ where: { businessId: a.rootId } }),
      db.customer.findMany({
        where: { businessId: { in: gids } },
        select: { id: true, name: true, phone: true },
        orderBy: { name: 'asc' },
        take: 1000,
      }),
      db.product.findMany({
        where: { businessId: { in: gids }, kind: 'product', active: true },
        select: { id: true, name: true, sku: true, stockQty: true },
        orderBy: { name: 'asc' },
        take: 1000,
      }),
      db.product.findMany({
        where: { businessId: { in: gids }, kind: 'service', active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      db.supplier.findMany({
        where: { businessId: { in: gids } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.ctx.members(a.rootId),
      db.fsWorkOrder.findMany({
        where: {
          businessId: a.rootId,
          status: { notIn: ['Draft', 'Cancelled', 'Closed'] },
          ...(a.techOnly ? { techUserId: a.userId } : {}),
        },
        select: {
          id: true,
          number: true,
          customerId: true,
          techUserId: true,
          status: true,
          version: true,
        },
        orderBy: { number: 'desc' },
        take: 500,
      }),
    ]);
    const site = new Map(eqSites.map((x) => [x.assetId, x.siteId]));
    const names = new Map(members.map((m) => [m.id, m.name]));
    return {
      me: {
        id: a.userId,
        name: a.name,
        role: a.roleLabel,
        techOnly: a.techOnly,
      },
      rights: {
        request: a.request,
        workorder: a.workorder,
        dispatch: a.dispatch,
        execute: a.execute,
        parts: a.parts,
        approve: a.approve,
        plan: a.plan,
        agreement: a.agreement,
        money: a.money,
        pii: a.pii,
        export: a.export,
        settings: a.settings,
      },
      cfg: {
        priorities: cfg.priorities,
        territories: cfg.territories,
        skills: cfg.skills,
        certs: cfg.certs,
        sla: cfg.sla,
        labor: cfg.labor,
        offline: cfg.offline,
        proof: cfg.proof,
        breakMin: cfg.tech.breakMin,
        version: s.version,
        warrantyEvidence: cfg.warranty.evidence,
      },
      next: {
        wo: await this.ctx.preview(a.rootId, 'wo'),
        sr: await this.ctx.preview(a.rootId, 'sr'),
      },
      services: svc.map((x) => ({
        id: x.id,
        code: x.code,
        name: x.name,
        skill: x.skill,
        cert: x.cert,
        durMin: x.durMin,
        priority: x.priority,
        proof: x.proof,
        parts: (x.partProductIds as string[]) ?? [],
        laborProductId: x.laborProductId,
        templateId: x.templateId,
        active: x.active,
      })),
      templates: tpls,
      techs: techs
        .filter((t) => names.has(t.userId))
        .map((t) => ({
          id: t.userId,
          name: names.get(t.userId)!,
          skills: t.skills as string[],
          certs: t.certs as string[],
          territories: t.territories as string[],
          shiftStart: Number(t.shiftStart),
          shiftEnd: Number(t.shiftEnd),
          tracking: t.tracking,
          active: t.active,
        })),
      people: members.map((m) => ({ id: m.id, name: m.name, role: m.label })),
      sites: sites.map((x) => ({
        id: x.id,
        customerId: x.customerId,
        label: x.label,
        address: x.address,
        zone: x.zone,
        access: x.access,
        safety: x.safety,
      })),
      equipment: eq.map((x) => ({ ...x, siteId: site.get(x.id) ?? null })),
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: a.pii ? c.phone : null,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stockQty,
      })),
      serviceProducts: services,
      contracts: (
        await db.ctContract.findMany({
          where: {
            businessId: a.rootId,
            cpKind: 'customer',
            status: { notIn: ['Archived', 'Terminated'] },
          },
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            cpId: true,
          },
          orderBy: { number: 'desc' },
          take: 1000,
        })
      ).map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        status: c.status,
        customerId: c.cpId,
      })),
      suppliers,
      wos: wos.map((w) => ({
        id: w.id,
        number: w.number,
        customerId: w.customerId,
        techUserId: w.techUserId,
        status: w.status,
        version: w.version,
      })),
    };
  }

  @Get('export')
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FsScopeQuery,
    @Res() res: Response,
  ) {
    const f = await this.docs.export(
      await this.actor(u),
      parseFsScope(q as Record<string, unknown>),
      q.what ?? 'workorders',
      q.format ?? 'csv',
      (q.ids ?? '').split(',').filter(Boolean),
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-Row-Count', String(f.rows));
    res.send(f.body);
  }

  @Get('files/:id')
  async file(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.fileUrl(await this.actor(u), id);
  }

  // ── requests ───────────────────────────────────────────────────────────

  @Post('requests')
  @UseInterceptors(
    FilesInterceptor('photos', 6, { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async createRequest(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFiles() files: Upload[],
  ) {
    let data: RequestIn;
    try {
      data = JSON.parse(b.data) as RequestIn;
    } catch {
      throw fsErr(FS_ERRORS.INVALID, 'Malformed request.');
    }
    return this.reqs.create(await this.actor(u), data, files ?? []);
  }
  @Post('requests/:id/triage')
  async triage(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TriageDto,
  ) {
    return this.reqs.triage(await this.actor(u), id, b);
  }
  @Post('requests/:id/convert')
  async convert(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ConvertDto,
  ) {
    return this.reqs.convert(await this.actor(u), id, b);
  }
  @Post('requests/:id/more-info')
  async moreInfo(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TextDto,
  ) {
    return this.reqs.moreInfo(await this.actor(u), id, b.text);
  }
  @Post('requests/:id/reject')
  async rejectReq(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RejectDto,
  ) {
    return this.reqs.reject(await this.actor(u), id, b);
  }
  @Post('from-assets/:kind/:id')
  async fromAssets(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.reqs.fromAssets(
      await this.actor(u),
      kind === 'wo' ? 'wo' : 'req',
      id,
    );
  }
  @Post('requests/:id/helpdesk')
  async helpdesk(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.reqs.toHelpdesk(await this.actor(u), id, b.reason);
  }

  // ── work orders ────────────────────────────────────────────────────────

  @Post('work-orders')
  async createWo(@CurrentUser() u: AuthenticatedUser, @Body() b: WoDto) {
    return this.wos.create(await this.actor(u), b);
  }
  @Post('work-orders/bulk')
  async bulk(@CurrentUser() u: AuthenticatedUser, @Body() b: BulkDto) {
    return this.wos.bulk(await this.actor(u), b);
  }
  @Post('work-orders/:id/approve')
  async approve(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: VersionDto,
  ) {
    return this.wos.approve(await this.actor(u), id, b.expected);
  }
  @Post('work-orders/:id/submit')
  async submit(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.submit(await this.actor(u), id);
  }
  @Get('work-orders/:id/suggest')
  async suggest(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('day') day: string,
    @Query('h') h?: string,
  ) {
    return this.wos.suggestFor(
      await this.actor(u),
      id,
      Number(day) || 0,
      h ? Number(h) : null,
    );
  }
  @Post('technicians/:userId/message')
  async messageTech(
    @CurrentUser() u: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() b: TextDto,
  ) {
    return this.wos.messageTech(await this.actor(u), userId, b.text);
  }
  @Post('work-orders/:id/preview')
  async preview(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PreviewDto,
  ) {
    return this.wos.preview(await this.actor(u), id, b.tech, b.day, b.h);
  }
  @Post('work-orders/:id/assign')
  async assign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AssignDto,
  ) {
    return this.wos.assign(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/schedule')
  async schedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ScheduleDto,
  ) {
    return this.wos.schedule(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/priority')
  async priority(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PriorityDto,
  ) {
    return this.wos.priority(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/cancel')
  async cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.wos.cancel(await this.actor(u), id, b.reason ?? '');
  }
  @Post('work-orders/:id/dispatch')
  async dispatch(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.dispatch(await this.actor(u), id);
  }
  @Post('work-orders/:id/tech')
  async tech(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TechActDto,
  ) {
    return this.wos.tech(await this.actor(u), id, b.act, b);
  }
  @Post('work-orders/:id/checklist')
  async checklist(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ChecklistDto,
  ) {
    return this.wos.checklist(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/sign')
  async sign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SignDto,
  ) {
    return this.wos.sign(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/note')
  async note(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: NoteDto,
  ) {
    return this.wos.note(await this.actor(u), id, b.text, b.key);
  }
  @Post('work-orders/:id/help')
  async help(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.help(await this.actor(u), id);
  }
  @Post('work-orders/:id/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async photo(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: StageDto,
    @UploadedFile() file: Upload,
  ) {
    return this.wos.upload(await this.actor(u), id, b.stage, file);
  }
  @Post('work-orders/:id/complete')
  async complete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CompleteDto,
  ) {
    return this.wos.complete(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/close')
  async close(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.close(await this.actor(u), id);
  }
  @Post('work-orders/:id/reopen')
  async reopen(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.wos.reopen(await this.actor(u), id, b.reason ?? '');
  }
  @Post('work-orders/:id/quote')
  async quote(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.quote(await this.actor(u), id);
  }
  @Post('work-orders/:id/invoice')
  async invoice(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.invoice(await this.actor(u), id);
  }
  @Post('work-orders/:id/pay-link')
  async payLink(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.paymentLink(await this.actor(u), id);
  }
  @Post('work-orders/:id/report')
  async report(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReportDto,
  ) {
    return this.wos.saveReport(await this.actor(u), id, b.html);
  }
  @Post('work-orders/:id/report/send')
  async sendReport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SummaryDto,
  ) {
    return this.wos.sendReport(await this.actor(u), id, b.summary);
  }
  @Post('work-orders/:id/notify')
  async notifyCustomer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.wos.notifyCustomer(await this.actor(u), id);
  }

  // ── parts ──────────────────────────────────────────────────────────────

  @Post('work-orders/:id/parts')
  async addPart(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AddPartDto,
  ) {
    return this.parts.add(await this.actor(u), id, b);
  }
  @Post('work-orders/:id/parts/:partId/reserve')
  async reserve(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partId') pid: string,
  ) {
    return this.parts.reserve(await this.actor(u), id, pid);
  }
  @Post('work-orders/:id/parts/:partId/issue')
  async issue(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partId') pid: string,
  ) {
    return this.parts.issue(await this.actor(u), id, pid);
  }
  @Post('work-orders/:id/parts/:partId/use')
  async use(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partId') pid: string,
    @Body() b: UsePartDto,
  ) {
    return this.parts.use(await this.actor(u), id, pid, b);
  }
  @Post('work-orders/:id/parts/:partId/return')
  async giveBack(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partId') pid: string,
    @Body() b: UsePartDto,
  ) {
    return this.parts.giveBack(await this.actor(u), id, pid, b);
  }
  @Post('work-orders/:id/parts/:partId/procure')
  async procure(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partId') pid: string,
    @Body() b: ProcureDto,
  ) {
    return this.parts.procure(await this.actor(u), id, pid, b.supplierId);
  }

  // ── labor ──────────────────────────────────────────────────────────────

  @Post('labor')
  async addLabor(@CurrentUser() u: AuthenticatedUser, @Body() b: LaborDto) {
    return this.labor.manual(await this.actor(u), b);
  }
  @Patch('labor/:id')
  async editLabor(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: LaborDto,
  ) {
    return this.labor.edit(await this.actor(u), id, b);
  }
  @Post('labor/:id/act')
  async laborAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: LaborActDto,
  ) {
    return this.labor.action(await this.actor(u), id, b.act, b.reason);
  }

  // ── plans, templates, inspections ──────────────────────────────────────

  @Post('plans')
  async addPlan(@CurrentUser() u: AuthenticatedUser, @Body() b: PlanDto) {
    return this.plans.save(await this.actor(u), null, b);
  }
  @Patch('plans/:id')
  async editPlan(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PlanDto,
  ) {
    return this.plans.save(await this.actor(u), id, b);
  }
  @Post('plans/:id/status')
  async planStatus(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActiveDto,
  ) {
    return this.plans.setStatus(await this.actor(u), id, b.active);
  }
  @Post('plans/:id/generate')
  async generate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.plans.generate(await this.actor(u), id);
  }
  @Post('templates')
  async addTemplate(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: TemplateDto,
  ) {
    return this.plans.createTemplate(await this.actor(u), b);
  }
  @Post('templates/:id/act')
  async templateAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TemplateActDto,
  ) {
    return this.plans.templateAction(await this.actor(u), id, b.act);
  }
  @Post('inspections/:id/approve')
  async approveIns(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.plans.approveInspection(await this.actor(u), id);
  }

  // ── agreements & warranty ──────────────────────────────────────────────

  @Post('agreements')
  async addAgreement(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: AgreementDto,
  ) {
    return this.cases.saveAgreement(await this.actor(u), null, b);
  }
  @Patch('agreements/:id')
  async editAgreement(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AgreementDto,
  ) {
    return this.cases.saveAgreement(await this.actor(u), id, b);
  }
  @Post('agreements/:id/status')
  async agreementStatus(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SuspendDto,
  ) {
    return this.cases.agreementStatus(
      await this.actor(u),
      id,
      b.suspend,
      b.reason,
    );
  }
  @Post('warranty')
  async openCase(@CurrentUser() u: AuthenticatedUser, @Body() b: CaseDto) {
    return this.cases.openCase(await this.actor(u), b);
  }
  @Post('warranty/:id/validate')
  async validate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.cases.validate(await this.actor(u), id);
  }
  @Post('warranty/:id/request-evidence')
  async reqEvidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.cases.requestEvidence(await this.actor(u), id);
  }
  @Post('warranty/:id/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async evidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Upload,
  ) {
    return this.cases.addEvidence(await this.actor(u), id, file);
  }
  @Post('warranty/:id/approve')
  async approveWrn(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.cases.approve(await this.actor(u), id, b.reason ?? '');
  }
  @Post('warranty/:id/reject')
  async rejectWrn(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: WrnRejectDto,
  ) {
    return this.cases.reject(await this.actor(u), id, b);
  }
  @Post('warranty/:id/close')
  async closeWrn(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.cases.closeCase(await this.actor(u), id);
  }

  // ── approvals, dispatch lock ───────────────────────────────────────────

  @Post('approvals/:id')
  async decide(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: DecideDto,
  ) {
    return this.approvals.decide(await this.actor(u), id, b.approve, b.reason);
  }
  @Post('dispatch/lock')
  async lock(@CurrentUser() u: AuthenticatedUser, @Body() b: LockDto) {
    return this.wos.lock(await this.actor(u), b.on);
  }

  // ── settings & records ─────────────────────────────────────────────────

  @Post('settings')
  async saveSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: SettingsDto,
  ) {
    return this.admin.save(await this.actor(u), {
      expectedVersion: b.expectedVersion,
      config: b.config,
      reason: b.reason,
    });
  }
  @Post('settings/diff')
  async diff(@CurrentUser() u: AuthenticatedUser, @Body() b: SettingsDiffDto) {
    return this.admin.diff(await this.actor(u), b.config);
  }
  @Post('service-types')
  async addSvc(@CurrentUser() u: AuthenticatedUser, @Body() b: ServiceTypeDto) {
    return this.admin.saveServiceType(await this.actor(u), null, b);
  }
  @Patch('service-types/:id')
  async editSvc(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ServiceTypeDto,
  ) {
    return this.admin.saveServiceType(await this.actor(u), id, b);
  }
  @Post('service-types/:id/active')
  async svcActive(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActiveDto,
  ) {
    return this.admin.toggleServiceType(await this.actor(u), id, b.active);
  }
  @Post('technicians')
  async saveTech(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: TechnicianDto,
  ) {
    return this.admin.saveTechnician(await this.actor(u), b);
  }
  @Post('technicians/:userId/status')
  async techStatus(
    @CurrentUser() u: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() b: TechStatusDto,
  ) {
    return this.admin.techStatus(await this.actor(u), userId, b.status);
  }
  @Post('sites')
  async addSite(@CurrentUser() u: AuthenticatedUser, @Body() b: SiteDto) {
    return this.admin.saveSite(await this.actor(u), null, b);
  }
  @Patch('sites/:id')
  async editSite(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SiteDto,
  ) {
    return this.admin.saveSite(await this.actor(u), id, b);
  }
  @Post('equipment/:assetId/site')
  async eqSite(
    @CurrentUser() u: AuthenticatedUser,
    @Param('assetId') assetId: string,
    @Body() b: EquipmentSiteDto,
  ) {
    return this.admin.equipmentSite(await this.actor(u), assetId, b.siteId);
  }
}
