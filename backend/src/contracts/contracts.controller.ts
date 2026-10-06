import {
  Body,
  Controller,
  Get,
  Param,
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
import { CtContextService, ctErr } from './ct-context.service';
import { CtDataService, parseCtScope } from './ct-data.service';
import { CtViewsService } from './ct-views.service';
import { CtDrawersService } from './ct-drawers.service';
import { CtDocsService, DocIn } from './ct-docs.service';
import { CtTemplatesService } from './ct-templates.service';
import { CtContractsService, WizardIn } from './ct-contracts.service';
import { CtApprovalsService } from './ct-approvals.service';
import { CtEsignService } from './ct-esign.service';
import { CmpIn, CtComplianceService } from './ct-compliance.service';
import { CtSettingsService } from './ct-settings.service';
import { CtExportService } from './ct-export.service';
import type { Upload } from './ct-files.service';
import { CT_ERRORS } from './ct.constants';
import {
  AckReqDto,
  AmendDto,
  CtScopeQuery,
  DecideDto,
  EditDto,
  ExportDto,
  FormDataDto,
  HoldDto,
  MessageDto,
  MoveDto,
  NameDto,
  NoteDto,
  OblDoneDto,
  OblDto,
  OwnerDto,
  ReasonDto,
  RenewDto,
  RequestDocDto,
  ReviewDto,
  SettingsDto,
  ShareDto,
  SigDto,
  SignerIdDto,
  SnoozeDto,
  TagDto,
  TaskDto,
  TemplateDto,
  TermDto,
  TerminateDto,
  WizardDto,
  WnrDto,
} from './dto/ct.dto';

const MAX = { limits: { fileSize: 200 * 1048576 } };
const parse = <T>(raw: string | undefined): T => {
  try {
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw ctErr(CT_ERRORS.INVALID, 'Malformed form data.');
  }
};

/** Contracts API. Auth/tenancy are global; contract rights are checked per action in the services. */
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly ctx: CtContextService,
    private readonly data: CtDataService,
    private readonly views: CtViewsService,
    private readonly drawers: CtDrawersService,
    private readonly docs: CtDocsService,
    private readonly templates: CtTemplatesService,
    private readonly contracts: CtContractsService,
    private readonly approvals: CtApprovalsService,
    private readonly esign: CtEsignService,
    private readonly compliance: CtComplianceService,
    private readonly settings: CtSettingsService,
    private readonly exporter: CtExportService,
  ) {}

  private actor(u: AuthenticatedUser) {
    return this.ctx.actor(u);
  }

  // ── reads ──────────────────────────────────────────────────────────────

  @Get('screen')
  async screen(@CurrentUser() u: AuthenticatedUser, @Query() q: CtScopeQuery) {
    return this.views.screen(
      await this.actor(u),
      parseCtScope(q as Record<string, unknown>),
    );
  }

  @Get('drawer/:kind/:id')
  async drawer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: CtScopeQuery,
  ) {
    return this.drawers.drawer(
      await this.actor(u),
      parseCtScope(q as Record<string, unknown>),
      kind,
      id,
    );
  }

  @Get('options')
  async options(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    const d = await this.data.load(a, parseCtScope({}));
    const projects = await this.ctx.db.project.findMany({
      where: {
        businessId: u.businessId,
        status: { notIn: ['Completed', 'Cancelled', 'Archived'] },
      },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'desc' },
      take: 300,
    });
    return {
      ...this.views.options(d),
      projects: projects.map((p) => ({
        v: p.id,
        t: `${p.number} · ${p.name}`,
      })),
      nextNumber: await this.ctx.previewContractNumber(a.rootId),
      rights: {
        upload: a.upload,
        documents: a.documents,
        delete: a.delete,
        manage: a.manage,
        approve: a.approve,
        terminate: a.terminate,
        evidence: a.evidence,
        compliance: a.compliance,
        value: a.value,
        restricted: a.restricted,
        export: a.export,
        settings: a.settings,
        contracts: a.contracts,
        owner: a.owner,
      },
    };
  }

  @Get('export')
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: CtScopeQuery,
    @Res() res: Response,
  ) {
    const f = await this.exporter.export(
      await this.actor(u),
      parseCtScope(q as Record<string, unknown>),
      q.what ?? 'Document index',
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

  @Post('export')
  async exportPost(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: ExportDto,
    @Res() res: Response,
  ) {
    const f = await this.exporter.export(
      await this.actor(u),
      parseCtScope({}),
      b.what,
      b.format ?? 'csv',
      b.ids ?? [],
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-Row-Count', String(f.rows));
    res.send(f.body);
  }

  @Get('evidence/:kind/:id')
  async evidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const f = await this.exporter.pack(
      await this.actor(u),
      parseCtScope({}),
      kind === 'cmp' ? 'cmp' : 'sig',
      id,
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.send(f.body);
  }

  // ── documents ──────────────────────────────────────────────────────────

  @Get('documents/duplicate')
  async duplicate(
    @CurrentUser() u: AuthenticatedUser,
    @Query('title') title: string,
    @Query('type') type: string,
  ) {
    return {
      hit: await this.docs.duplicate(
        await this.actor(u),
        title ?? '',
        type ?? '',
      ),
    };
  }

  @Post('documents')
  @UseInterceptors(FilesInterceptor('files', 50, MAX))
  async upload(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFiles() files: Upload[] = [],
  ) {
    return this.docs.create(
      await this.actor(u),
      parse<DocIn>(b.data),
      files ?? [],
    );
  }

  @Post('documents/:id/version')
  @UseInterceptors(FileInterceptor('file', MAX))
  async version(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: FormDataDto,
    @UploadedFile() file?: Upload,
  ) {
    return this.docs.newVersion(
      await this.actor(u),
      id,
      parse<{ note?: string }>(b.data).note ?? '',
      file ?? null,
    );
  }

  @Post('documents/move')
  async move(@CurrentUser() u: AuthenticatedUser, @Body() b: MoveDto) {
    return this.docs.move(await this.actor(u), b.ids, b.folder);
  }

  @Post('documents/tag')
  async tag(@CurrentUser() u: AuthenticatedUser, @Body() b: TagDto) {
    return this.docs.tag(await this.actor(u), b.ids, b.tags);
  }

  @Post('documents/:id/share')
  async share(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ShareDto,
  ) {
    return this.docs.share(
      await this.actor(u),
      id,
      b.userIds,
      b.perm ?? 'View',
    );
  }

  @Post('documents/:id/archive')
  async archiveDoc(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.docs.archive(await this.actor(u), id, b.reason ?? '');
  }

  @Post('documents/:id/restore')
  async restoreDoc(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.docs.archive(await this.actor(u), id, '', true);
  }

  @Post('documents/:id/delete')
  async deleteDoc(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.docs.remove(await this.actor(u), id, b.reason ?? '');
  }

  @Post('documents/:id/hold')
  async hold(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: HoldDto,
  ) {
    return this.docs.hold(await this.actor(u), id, b.reason ?? null);
  }

  @Get('documents/:id/download')
  async download(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('v') v?: string,
  ) {
    return this.docs.download(
      await this.actor(u),
      id,
      v ? Number(v) : undefined,
    );
  }

  @Post('folders')
  async folder(@CurrentUser() u: AuthenticatedUser, @Body() b: NameDto) {
    return this.docs.folder(await this.actor(u), b.name);
  }

  @Post('documents/request')
  async requestDoc(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: RequestDocDto,
  ) {
    return this.docs.request(
      await this.actor(u),
      b.party,
      b.what,
      b.due ?? null,
    );
  }

  // ── templates ──────────────────────────────────────────────────────────

  @Post('templates')
  async newTemplate(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: TemplateDto,
  ) {
    return this.templates.save(await this.actor(u), null, b);
  }

  @Post('templates/:id')
  async editTemplate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TemplateDto,
  ) {
    return this.templates.save(await this.actor(u), id, b);
  }

  @Post('templates/:id/duplicate')
  async dupTemplate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.duplicate(await this.actor(u), id);
  }

  @Post('templates/:id/publish')
  async publish(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.templates.publish(await this.actor(u), id);
  }

  @Post('templates/:id/archive')
  async archiveTpl(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.archive(await this.actor(u), id);
  }

  // ── contracts ──────────────────────────────────────────────────────────

  @Post('preview')
  async preview(@CurrentUser() u: AuthenticatedUser, @Body() b: WizardDto) {
    return this.contracts.preview(await this.actor(u), b);
  }

  @Post('all')
  @UseInterceptors(FileInterceptor('file', MAX))
  async create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFile() file?: Upload,
  ) {
    return this.contracts.create(
      await this.actor(u),
      parse<WizardIn>(b.data),
      file ?? null,
    );
  }

  @Post('all/:id/edit')
  async edit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: EditDto,
  ) {
    return this.contracts.edit(await this.actor(u), id, b);
  }

  @Post('all/:id/submit')
  async submit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: NoteDto,
  ) {
    return this.contracts.submit(await this.actor(u), id, b.note ?? '');
  }

  @Post('all/:id/archive')
  async archive(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.contracts.archive(await this.actor(u), id, b.reason ?? '');
  }

  @Post('all/:id/terminate')
  async terminate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TerminateDto,
  ) {
    return this.contracts.terminate(
      await this.actor(u),
      id,
      b.eff,
      b.reason,
      b.typed,
    );
  }

  @Post('all/:id/renew')
  async renew(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RenewDto,
  ) {
    return this.contracts.renew(
      await this.actor(u),
      id,
      b.end,
      b.changes ?? '',
    );
  }

  @Post('all/:id/wnr')
  async wnr(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: WnrDto,
  ) {
    return this.contracts.wnr(await this.actor(u), id, b.reason, !!b.notify);
  }

  @Post('expiries/snooze')
  async snooze(@CurrentUser() u: AuthenticatedUser, @Body() b: SnoozeDto) {
    return this.contracts.snooze(
      await this.actor(u),
      b.key,
      b.until,
      b.reason,
      !!b.ok,
    );
  }

  @Post('expiries/message')
  async message(@CurrentUser() u: AuthenticatedUser, @Body() b: MessageDto) {
    return this.contracts.message(await this.actor(u), b.kind, b.key, b.msg);
  }

  @Post('all/:id/terms')
  async term(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TermDto,
  ) {
    return this.contracts.term(await this.actor(u), id, b);
  }

  @Post('all/:id/terms/:termId')
  async correct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('termId') termId: string,
    @Body() b: TermDto,
  ) {
    return this.contracts.term(await this.actor(u), id, b, termId);
  }

  @Post('all/:id/obligations')
  async obligation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: OblDto,
  ) {
    return this.contracts.obligation(await this.actor(u), id, b);
  }

  @Post('all/:id/obligations/:oblId/done')
  async oblDone(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('oblId') oblId: string,
    @Body() b: OblDoneDto,
  ) {
    return this.contracts.oblDone(
      await this.actor(u),
      id,
      oblId,
      b.evidenceDocId ?? null,
      b.note ?? '',
      !!b.waive,
    );
  }

  @Post('tasks')
  async task(@CurrentUser() u: AuthenticatedUser, @Body() b: TaskDto) {
    return this.contracts.task(await this.actor(u), b);
  }

  @Post('all/:id/amendments')
  async amend(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmendDto,
  ) {
    return this.contracts.amend(await this.actor(u), id, b);
  }

  @Post('all/:id/amendments/:amendId/submit')
  async submitAmend(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('amendId') amendId: string,
    @Body() b: NoteDto,
  ) {
    return this.contracts.submitAmend(
      await this.actor(u),
      id,
      amendId,
      b.note ?? '',
    );
  }

  @Post('bulk/owner')
  async bulkOwner(@CurrentUser() u: AuthenticatedUser, @Body() b: OwnerDto) {
    return this.contracts.bulkOwner(await this.actor(u), b.ids, b.ownerId);
  }

  @Post('bulk/review')
  async bulkReview(@CurrentUser() u: AuthenticatedUser, @Body() b: ReviewDto) {
    return this.contracts.bulkReview(await this.actor(u), b.ids, b.note ?? '');
  }

  // ── approvals ──────────────────────────────────────────────────────────

  @Post('approvals/:id/decide')
  async decide(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: DecideDto,
  ) {
    return this.approvals.decide(
      await this.actor(u),
      id,
      b.dec,
      b.comment ?? '',
      b.toUserId ?? null,
    );
  }

  // ── signatures ─────────────────────────────────────────────────────────

  @Post('signatures')
  async prepare(@CurrentUser() u: AuthenticatedUser, @Body() b: SigDto) {
    return this.esign.prepare(await this.actor(u), b);
  }

  @Post('signatures/:id/send')
  async send(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.esign.send(await this.actor(u), id);
  }

  @Post('signatures/:id/remind')
  async remind(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.esign.remind(await this.actor(u), id);
  }

  @Post('signatures/:id/link')
  async link(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SignerIdDto,
  ) {
    return this.esign.manualLink(await this.actor(u), id, b.signerId);
  }

  @Post('signatures/:id/void')
  async void(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.esign.void(await this.actor(u), id, b.reason ?? '');
  }

  @Get('signatures/:id/signed')
  async signed(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const s = await this.esign.load(a.rootId, id);
    if (!s || s.status !== 'Completed')
      throw ctErr(CT_ERRORS.STATUS, 'Not completed yet.');
    return this.docs.download(a, s.docId, s.docVersion);
  }

  // ── compliance ─────────────────────────────────────────────────────────

  @Post('compliance')
  @UseInterceptors(FileInterceptor('file', MAX))
  async newCmp(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFile() file?: Upload,
  ) {
    return this.compliance.create(
      await this.actor(u),
      parse<CmpIn>(b.data),
      file ?? null,
    );
  }

  @Post('compliance/:id/upload')
  @UseInterceptors(FileInterceptor('file', MAX))
  async cmpUpload(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: FormDataDto,
    @UploadedFile() file?: Upload,
  ) {
    return this.compliance.upload(
      await this.actor(u),
      id,
      parse<CmpIn>(b.data),
      file ?? null,
    );
  }

  @Post('compliance/:id/publish')
  async cmpPublish(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.compliance.publish(await this.actor(u), id);
  }

  @Post('compliance/:id/request-ack')
  async cmpAck(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AckReqDto,
  ) {
    return this.compliance.requestAck(
      await this.actor(u),
      id,
      b.scope ?? 'pending',
      b.msg ?? '',
    );
  }

  @Post('compliance/:id/ack')
  async cmpSelfAck(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.compliance.acknowledge(await this.actor(u), id);
  }

  @Post('compliance/:id/archive')
  async cmpArchive(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReasonDto,
  ) {
    return this.compliance.archive(await this.actor(u), id, b.reason ?? '');
  }

  @Post('compliance/:id/restore')
  async cmpRestore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.compliance.archive(await this.actor(u), id, '', true);
  }

  // ── settings ───────────────────────────────────────────────────────────

  @Post('settings')
  async saveSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: SettingsDto,
  ) {
    return this.settings.save(await this.actor(u), b.config, b.expectedVersion);
  }

  @Post('settings/validate')
  async validateSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: SettingsDto,
  ) {
    return this.settings.check(await this.actor(u), b.config);
  }

  @Get('settings/email-health')
  emailHealth() {
    return this.settings.emailHealth();
  }
}
