import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { AmContextService, amErr } from './am-context.service';
import { parseScope } from './am-data.service';
import { AmViewsService } from './am-views.service';
import { AmDrawersService } from './am-drawers.service';
import { AmAssetsService } from './am-assets.service';
import { AmMaintService } from './am-maint.service';
import { AmWorkOrdersService } from './am-workorders.service';
import { AmPmService } from './am-pm.service';
import { AmTaxonomyService } from './am-taxonomy.service';
import { AmSettingsService } from './am-settings.service';
import { AmDocsService } from './am-docs.service';
import { AM_ERRORS, FINAL_ASSET, mergeConfig } from './am.constants';
import {
  AmScopeQuery,
  AssetDto,
  AssignDto,
  BillLinkDto,
  BulkDto,
  CategoryDto,
  CompleteDto,
  CorrectDto,
  CostDto,
  DocDto,
  DowntimeDto,
  FieldDto,
  InspectDto,
  LaborDto,
  LocationDto,
  MoveDto,
  PartDto,
  PlanDto,
  PlanStatusDto,
  PriorityDto,
  ReadingDto,
  ReasonDto,
  ReqActionDto,
  RequestDto,
  RescheduleDto,
  RetireDto,
  ReturnDto,
  SavedViewDto,
  ScheduleDto,
  ServiceDto,
  SettingsDto,
  StatusDto,
  TaxActionDto,
  TeamDto,
  TemplateDto,
  TransferDto,
  WoDto,
} from './dto/assets.dto';

type Upload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/** Assets & Maintenance API. Auth/tenancy are global; asset rights are checked per action in the services. */
@Controller('assets-maintenance')
export class AssetsController {
  constructor(
    private readonly ctx: AmContextService,
    private readonly views: AmViewsService,
    private readonly drawers: AmDrawersService,
    private readonly assets: AmAssetsService,
    private readonly maint: AmMaintService,
    private readonly wos: AmWorkOrdersService,
    private readonly pm: AmPmService,
    private readonly tax: AmTaxonomyService,
    private readonly settings: AmSettingsService,
    private readonly docs: AmDocsService,
  ) {}

  private actor(u: AuthenticatedUser) {
    return this.ctx.actor(u);
  }

  // ── reads ────────────────────────────────────────────────────────────────

  @Get('screen')
  async screen(@CurrentUser() u: AuthenticatedUser, @Query() q: AmScopeQuery) {
    return this.views.screen(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
    );
  }

  @Get('drawer/:kind/:id')
  async drawer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: AmScopeQuery,
  ) {
    return this.drawers.drawer(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
      kind,
      id,
      q.wtab,
    );
  }

  /** Pick-lists for modals — every option is a real record. */
  @Get('options')
  async options(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    const nm = await this.ctx.names(a.rootId);
    const group = nm.group.filter(
      (g) => !a.branches || a.branches.includes(g.id),
    );
    const gids = nm.group.map((g) => g.id);
    const db = this.ctx.db;
    const [
      assets,
      cats,
      locs,
      templates,
      cfields,
      products,
      customers,
      finAssets,
      finBills,
      s,
    ] = await Promise.all([
      db.amAsset.findMany({
        where: { businessId: a.rootId },
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
          meterType: true,
          meterUnit: true,
          branchId: true,
          condition: true,
          criticality: true,
          teamId: true,
        },
        orderBy: { number: 'asc' },
      }),
      db.amCategory.findMany({
        where: { businessId: a.rootId },
        orderBy: { name: 'asc' },
      }),
      db.amLocation.findMany({
        where: { businessId: a.rootId },
        orderBy: { code: 'asc' },
      }),
      db.amPmTemplate.findMany({
        where: { businessId: a.rootId },
        orderBy: { name: 'asc' },
      }),
      db.amCustomField.findMany({
        where: { businessId: a.rootId },
        orderBy: { name: 'asc' },
      }),
      db.product.findMany({
        where: { businessId: { in: gids }, kind: 'product', active: true },
        select: { id: true, name: true, stockQty: true, businessId: true },
        orderBy: { name: 'asc' },
        take: 1000,
      }),
      db.customer.findMany({
        where: { businessId: { in: gids } },
        select: { id: true, name: true, phone: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      a.cost
        ? db.finAsset.findMany({
            where: { businessId: a.rootId },
            select: { id: true, number: true, name: true },
            orderBy: { number: 'asc' },
          })
        : Promise.resolve([] as { id: string; number: string; name: string }[]),
      a.cost
        ? db.finBill.findMany({
            where: {
              businessId: a.rootId,
              status: { notIn: ['Voided', 'Rejected'] },
            },
            select: { id: true, number: true, vendorName: true, total: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : Promise.resolve(
            [] as {
              id: string;
              number: string;
              vendorName: string;
              total: Prisma.Decimal;
            }[],
          ),
      this.ctx.ensure(a.rootId),
    ]);
    const path = (id: string | null): string => {
      const out: string[] = [];
      let l = locs.find((x) => x.id === id);
      let g = 0;
      while (l && g++ < 20) {
        out.unshift(l.name);
        l = locs.find((x) => x.id === l!.parentId);
      }
      return out.join(' › ');
    };
    const cfg = mergeConfig(s.config);
    return {
      me: { id: a.userId, name: a.name, role: a.roleLabel },
      rights: {
        create: a.create,
        edit: a.edit,
        transfer: a.transfer,
        retire: a.retire,
        request: a.request,
        approve: a.approve,
        start: a.start,
        complete: a.complete,
        pm: a.pm,
        cost: a.cost,
        export: a.export,
        reading: a.reading,
        settings: a.settings,
      },
      cfg,
      nextNumber:
        cfg.numbering.prefix +
        String(s.nextAsset).padStart(cfg.numbering.pad, '0'),
      branches: group.map((g) => ({ id: g.id, name: g.name })),
      assets: assets
        .filter(
          (x) => !a.branches || (x.branchId && a.branches.includes(x.branchId)),
        )
        .map((x) => ({ ...x, live: !FINAL_ASSET.includes(x.status) })),
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        status: c.status,
        criticality: c.criticality,
        templateId: c.templateId,
        warrantyType: c.warrantyType,
        code: c.code,
        lifeYears: c.lifeYears,
        description: c.description,
      })),
      locations: locs.map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code,
        type: l.type,
        parentId: l.parentId,
        branchId: l.branchId,
        status: l.status,
        path: `${nm.group.find((g) => g.id === l.branchId)?.name ?? ''} › ${path(l.id)}`,
      })),
      teams: nm.teams.map((t) => ({
        id: t.id,
        name: t.name,
        members: t.members.map((m) => m.userId),
      })),
      people: nm.people.map((p) => ({ id: p.id, name: p.name, role: p.label })),
      suppliers: nm.suppliers,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        checklist: t.checklist,
      })),
      fields: cfields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        options: f.options,
        categoryIds: f.categoryIds,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stockQty,
      })),
      customers: customers.map((c) => ({ id: c.id, name: c.name || c.phone })),
      finAssets,
      finBills: finBills.map((b) => ({
        id: b.id,
        label: `${b.number} · ${b.vendorName} · ${Number(b.total).toLocaleString()}`,
      })),
    };
  }

  @Get('lookup')
  async lookup(@CurrentUser() u: AuthenticatedUser, @Query() q: AmScopeQuery) {
    return this.assets.lookup(await this.actor(u), q.code ?? '');
  }

  @Get('export')
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: AmScopeQuery,
    @Res() res: Response,
  ) {
    const f = await this.docs.export(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
      q.what ?? 'register',
      q.format ?? 'csv',
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-Row-Count', String(f.rows));
    res.send(f.body);
  }

  // ── assets ───────────────────────────────────────────────────────────────

  @Get('assets/:id')
  async getAsset(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const x = await this.assets.must(a.rootId, id);
    if (a.branches && x.branchId && !a.branches.includes(x.branchId))
      throw amErr(AM_ERRORS.NOT_FOUND, 'ASSET_NOT_FOUND', HttpStatus.NOT_FOUND);
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    return {
      ...x,
      cost: a.cost && x.cost != null ? Number(x.cost) : null,
      purchasedOn: day(x.purchasedOn),
      installedOn: day(x.installedOn),
      warrantyStart: day(x.warrantyStart),
      warrantyEnd: day(x.warrantyEnd),
    };
  }

  @Get('work-orders/:id/brief')
  async woBrief(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const w = await this.wos.must(a.rootId, id);
    const x = await this.assets.must(a.rootId, w.assetId);
    const open = await this.ctx.db.amDowntime.count({
      where: { assetId: x.id, endAt: null },
    });
    return {
      id: w.id,
      number: w.number,
      status: w.status,
      priority: w.priority,
      type: w.type,
      supplier: !!w.supplierId,
      asset: {
        id: x.id,
        number: x.number,
        name: x.name,
        condition: x.condition,
        status: x.status,
        meterType: x.meterType,
        meterUnit: x.meterUnit,
      },
      openDowntime: open > 0,
      parts: w.parts.map((p) => ({
        id: p.id,
        productId: p.productId,
        planned: p.planned,
        issued: p.issued,
        returned: p.returned,
      })),
    };
  }

  @Get('pm-plans/:id')
  async getPlan(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const p = await this.pm.must(a.rootId, id);
    return {
      ...p,
      nextDueOn: p.nextDueOn ? p.nextDueOn.toISOString().slice(0, 10) : '',
      nextDueMeter: p.nextDueMeter != null ? Number(p.nextDueMeter) : null,
      meterInterval: p.meterInterval != null ? Number(p.meterInterval) : null,
      who: p.supplierId
        ? `s:${p.supplierId}`
        : p.assigneeUserId
          ? `u:${p.assigneeUserId}`
          : p.teamId
            ? `t:${p.teamId}`
            : '',
    };
  }

  @Post('assets')
  async create(@CurrentUser() u: AuthenticatedUser, @Body() b: AssetDto) {
    return this.assets.create(await this.actor(u), b);
  }

  @Patch('assets/:id')
  async update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AssetDto,
  ) {
    return this.assets.update(await this.actor(u), id, b);
  }

  @Post('assets/:id/status')
  async status(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: StatusDto,
  ) {
    return this.assets.changeStatus(await this.actor(u), id, b.to, b.reason);
  }

  @Post('assets/:id/transfer')
  async transfer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TransferDto,
  ) {
    return this.assets.transfer(await this.actor(u), id, b);
  }

  @Post('assets/:id/retire')
  async retire(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RetireDto,
  ) {
    return this.assets.retire(await this.actor(u), id, b);
  }

  @Post('assets/:id/archive')
  async archive(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.assets.archive(await this.actor(u), id, b.reason);
  }

  @Post('assets-bulk')
  async bulk(@CurrentUser() u: AuthenticatedUser, @Body() b: BulkDto) {
    return this.assets.bulk(await this.actor(u), b);
  }

  @Post('assets/:id/docs')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async upload(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Upload,
    @Body() b: DocDto,
  ) {
    return this.assets.uploadDoc(
      await this.actor(u),
      id,
      b.type ?? 'Manual',
      file,
    );
  }

  @Get('docs/:id/url')
  async docUrl(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.assets.docUrl(await this.actor(u), id);
  }

  @Delete('docs/:id')
  async docDel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.assets.unlinkDoc(await this.actor(u), id);
  }

  // ── readings, requests, downtime, history ────────────────────────────────

  @Post('readings')
  async reading(@CurrentUser() u: AuthenticatedUser, @Body() b: ReadingDto) {
    return this.maint.recordReading(await this.actor(u), b);
  }

  @Post('readings/:id/correct')
  async correct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CorrectDto,
  ) {
    return this.maint.correctReading(await this.actor(u), id, b);
  }

  @Post('requests')
  async request(@CurrentUser() u: AuthenticatedUser, @Body() b: RequestDto) {
    return this.maint.createRequest(await this.actor(u), b);
  }

  @Post('requests/:id/action')
  async reqAction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReqActionDto,
  ) {
    return this.maint.reqAction(await this.actor(u), id, b.act, b);
  }

  @Post('requests/:id/convert')
  async convert(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: WoDto,
  ) {
    return this.wos.convert(await this.actor(u), id, b);
  }

  @Post('downtime')
  async down(@CurrentUser() u: AuthenticatedUser, @Body() b: DowntimeDto) {
    return this.maint.logDowntime(await this.actor(u), b);
  }

  @Post('downtime/:id/end')
  async downEnd(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.maint.endDowntime(await this.actor(u), id);
  }

  @Post('inspections')
  async inspect(@CurrentUser() u: AuthenticatedUser, @Body() b: InspectDto) {
    return this.maint.inspect(await this.actor(u), b);
  }

  @Post('services')
  async service(@CurrentUser() u: AuthenticatedUser, @Body() b: ServiceDto) {
    return this.maint.service(await this.actor(u), b);
  }

  // ── work orders ──────────────────────────────────────────────────────────

  @Post('work-orders')
  async woCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: WoDto) {
    return this.wos.create(await this.actor(u), {
      ...b,
      assetId: b.assetId ?? '',
      scope: b.scope ?? '',
    });
  }

  @Post('work-orders/:id/move')
  async woMove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: MoveDto,
  ) {
    return this.wos.move(await this.actor(u), id, b.action, b.reason);
  }

  @Post('work-orders/:id/assign')
  async woAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AssignDto,
  ) {
    return this.wos.assign(await this.actor(u), id, b.who);
  }

  @Post('work-orders/:id/schedule')
  async woSchedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ScheduleDto,
  ) {
    return this.wos.schedule(await this.actor(u), id, b);
  }

  @Post('work-orders/:id/priority')
  async woPriority(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PriorityDto,
  ) {
    return this.wos.setPriority(await this.actor(u), id, b.priority, b.reason);
  }

  @Post('work-orders/:id/checklist/:item')
  async woCheck(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('item') item: string,
  ) {
    return this.wos.toggleCheck(await this.actor(u), id, item);
  }

  @Post('work-orders/:id/parts')
  async woPart(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PartDto,
  ) {
    return this.wos.addPart(await this.actor(u), id, b);
  }

  @Post('work-orders/:id/parts/issue')
  async woIssue(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.wos.issueParts(await this.actor(u), id);
  }

  @Post('work-orders/:id/parts/:part/return')
  async woReturn(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('part') part: string,
    @Body() b: ReturnDto,
  ) {
    return this.wos.returnPart(await this.actor(u), id, part, b.qty);
  }

  @Post('work-orders/:id/labor')
  async woLabor(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: LaborDto,
  ) {
    return this.wos.logLabor(await this.actor(u), id, b);
  }

  @Post('work-orders/:id/costs')
  async woCost(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CostDto,
  ) {
    return this.wos.addCost(await this.actor(u), id, b);
  }

  @Post('costs/:id/bill')
  async costBill(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: BillLinkDto,
  ) {
    return this.wos.linkBill(await this.actor(u), id, b.finBillId ?? null);
  }

  @Post('work-orders/:id/complete')
  async woComplete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CompleteDto,
  ) {
    return this.wos.complete(await this.actor(u), id, b);
  }

  // ── preventive ───────────────────────────────────────────────────────────

  @Post('pm-plans')
  async pmCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: PlanDto) {
    return this.pm.create(await this.actor(u), b);
  }

  @Patch('pm-plans/:id')
  async pmUpdate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PlanDto,
  ) {
    return this.pm.update(await this.actor(u), id, b);
  }

  @Post('pm-plans/:id/generate')
  async pmGenerate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pm.generateManual(await this.actor(u), id);
  }

  @Post('pm-plans/:id/reschedule')
  async pmResched(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RescheduleDto,
  ) {
    return this.pm.reschedule(await this.actor(u), id, b);
  }

  @Post('pm-plans/:id/status')
  async pmStatus(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PlanStatusDto,
  ) {
    return this.pm.setStatus(await this.actor(u), id, b.act);
  }

  @Post('pm-evaluate')
  async pmRun(@CurrentUser() u: AuthenticatedUser) {
    return this.pm.runNow(await this.actor(u));
  }

  // ── taxonomy ─────────────────────────────────────────────────────────────

  @Post('categories')
  async catCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: CategoryDto) {
    return this.tax.saveCategory(await this.actor(u), null, b);
  }

  @Patch('categories/:id')
  async catUpdate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CategoryDto,
  ) {
    return this.tax.saveCategory(await this.actor(u), id, b);
  }

  @Post('categories/:id/action')
  async catAction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TaxActionDto,
  ) {
    return this.tax.categoryAction(await this.actor(u), id, b.act, b.to);
  }

  @Post('locations')
  async locCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: LocationDto) {
    return this.tax.saveLocation(await this.actor(u), null, b);
  }

  @Patch('locations/:id')
  async locUpdate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: LocationDto,
  ) {
    return this.tax.saveLocation(await this.actor(u), id, b);
  }

  @Post('locations/:id/action')
  async locAction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TaxActionDto,
  ) {
    return this.tax.locationAction(await this.actor(u), id, b.act, b.to);
  }

  @Post('teams')
  async teamCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: TeamDto) {
    return this.tax.saveTeam(await this.actor(u), null, b);
  }

  @Patch('teams/:id')
  async teamUpdate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TeamDto,
  ) {
    return this.tax.saveTeam(await this.actor(u), id, b);
  }

  @Delete('teams/:id')
  async teamDel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.tax.removeTeam(await this.actor(u), id);
  }

  @Post('templates')
  async tplCreate(@CurrentUser() u: AuthenticatedUser, @Body() b: TemplateDto) {
    return this.tax.saveTemplate(await this.actor(u), null, b);
  }

  @Patch('templates/:id')
  async tplUpdate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TemplateDto,
  ) {
    return this.tax.saveTemplate(await this.actor(u), id, b);
  }

  @Delete('templates/:id')
  async tplDel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.tax.removeTemplate(await this.actor(u), id);
  }

  @Post('fields')
  async fieldAdd(@CurrentUser() u: AuthenticatedUser, @Body() b: FieldDto) {
    return this.tax.addField(await this.actor(u), b);
  }

  @Delete('fields/:id')
  async fieldDel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.tax.removeField(await this.actor(u), id);
  }

  // ── settings, views, insights, import ────────────────────────────────────

  @Patch('settings')
  async saveSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: SettingsDto,
  ) {
    return this.settings.save(await this.actor(u), b);
  }

  @Post('views')
  async saveView(@CurrentUser() u: AuthenticatedUser, @Body() b: SavedViewDto) {
    const a = await this.actor(u);
    return this.ctx.db.amSavedView.upsert({
      where: {
        businessId_userId_name: {
          businessId: a.rootId,
          userId: a.userId,
          name: b.name.trim(),
        },
      },
      create: {
        businessId: a.rootId,
        userId: a.userId,
        name: b.name.trim(),
        filters: b.filters as never,
      },
      update: { filters: b.filters as never },
    });
  }

  @Get('views/:id')
  async view(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    return this.ctx.db.amSavedView.findFirstOrThrow({
      where: { id, businessId: a.rootId, userId: a.userId },
    });
  }

  @Delete('views/:id')
  async delView(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    await this.ctx.db.amSavedView.deleteMany({
      where: { id, businessId: a.rootId, userId: a.userId },
    });
    return { ok: true };
  }

  @Post('insights/:key/dismiss')
  async dismiss(
    @CurrentUser() u: AuthenticatedUser,
    @Param('key') key: string,
  ) {
    const a = await this.actor(u);
    await this.ctx.db.amInsightDismissal.upsert({
      where: {
        businessId_key: { businessId: a.rootId, key: key.slice(0, 80) },
      },
      create: {
        businessId: a.rootId,
        key: key.slice(0, 80),
        byUserId: a.userId,
      },
      update: {},
    });
    await this.ctx.audit(a.rootId, a, 'Insight dismissed', 'insight', key, key);
    return { ok: true };
  }

  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importPreview(
    @CurrentUser() u: AuthenticatedUser,
    @UploadedFile() file: Upload,
  ) {
    return this.docs.preview(
      await this.actor(u),
      file?.buffer,
      file?.originalname ?? '',
    );
  }

  @Post('import/commit')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importCommit(
    @CurrentUser() u: AuthenticatedUser,
    @UploadedFile() file: Upload,
  ) {
    return this.docs.commit(
      await this.actor(u),
      file?.buffer,
      file?.originalname ?? '',
    );
  }
}
