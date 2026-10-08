import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { Upload } from '../contracts/ct-files.service';
import { PpContextService, ppErr } from './pp-context.service';
import { PpDataService, PpScope } from './pp-data.service';
import { PpViewsService } from './pp-views.service';
import { PpDrawersService } from './pp-drawers.service';
import { PpPeopleService } from './pp-people.service';
import { CandIn, PpRecruitService } from './pp-recruit.service';
import { LeaveIn, PpLeaveService } from './pp-leave.service';
import { PpPayrollService } from './pp-payroll.service';
import { PpHrService } from './pp-hr.service';
import { PpSettingsService } from './pp-settings.service';
import { PpExportService } from './pp-export.service';
import {
  EMP_TYPES,
  EXIT_TYPES,
  PP_ERRORS,
  ROUNDS,
  RULE_TYPES,
  SOURCES,
  STAGES,
  TAX_TREATMENTS,
  WORK_MODES,
  COURSE_TYPES,
  BASIS,
  TAX_STATUS,
} from './pp.constants';
import {
  ActDto,
  AssignDto,
  AssignTrDto,
  CorrectionDto,
  CourseDto,
  CycleActDto,
  CycleDto,
  DateDto,
  DeptDto,
  ExcDto,
  FixDto,
  FormDataDto,
  HireDto,
  IntDto,
  JobDto,
  LeaveActDto,
  MessageDto,
  OfbDto,
  OfferDto,
  OnbEditDto,
  OnbItemDto,
  PpScopeQuery,
  PpSettingsDto,
  ProfileDto,
  RejectDto,
  ReviewActDto,
  RuleDto,
  RunStartDto,
  ScoreDto,
  StageDto,
  TextDto,
} from './dto/pp.dto';

const MAX = { limits: { fileSize: 25 * 1048576 } };
const parse = <T>(raw: string | undefined): T => {
  try {
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw ppErr(PP_ERRORS.INVALID, 'Malformed form data.');
  }
};
const up = (f?: Express.Multer.File): Upload | null =>
  f
    ? {
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        buffer: f.buffer,
      }
    : null;
export function parsePpScope(q: Record<string, unknown>): PpScope {
  const j = (v: unknown) => {
    try {
      return typeof v === 'string' && v
        ? (JSON.parse(v) as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  return {
    tab: str(q.tab, 'overview'),
    branch: str(q.branch, ''),
    dept: str(q.dept, ''),
    f: j(q.f) as PpScope['f'],
    page: j(q.page) as PpScope['page'],
    view: j(q.view) as PpScope['view'],
    run: str(q.run, ''),
  };
}

/** People & Payroll API. Auth/tenancy are global; People rights are checked per action in the services. */
@Controller('people')
export class PeopleController {
  constructor(
    private readonly ctx: PpContextService,
    private readonly data: PpDataService,
    private readonly views: PpViewsService,
    private readonly drawers: PpDrawersService,
    private readonly people: PpPeopleService,
    private readonly recruit: PpRecruitService,
    private readonly leave: PpLeaveService,
    private readonly payroll: PpPayrollService,
    private readonly hr: PpHrService,
    private readonly settings: PpSettingsService,
    private readonly exporter: PpExportService,
  ) {}

  private actor(u: AuthenticatedUser) {
    return this.ctx.actor(u);
  }

  // ── reads ──────────────────────────────────────────────────────────────

  @Get('screen')
  async screen(@CurrentUser() u: AuthenticatedUser, @Query() q: PpScopeQuery) {
    const a = await this.actor(u);
    const s = parsePpScope(q as Record<string, unknown>);
    if (s.tab === 'onboarding')
      await this.hr.syncOnboarding(a.rootId).catch(() => 0);
    if (s.tab === 'offboarding')
      await this.hr.syncOffboarding(a.rootId).catch(() => 0);
    return this.views.screen(a, await this.data.load(a, s));
  }

  @Get('drawer/:kind/:id')
  async drawer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: PpScopeQuery,
  ) {
    const a = await this.actor(u);
    if (kind === 'slip') {
      const [rid, uid] = id.split('|');
      await this.payroll.viewed(a, rid, uid).catch(() => undefined);
    }
    if (kind === 'audit') this.ctx.need(a, 'audit', 'Viewing the audit log');
    const d = await this.data.load(
      a,
      parsePpScope(q as Record<string, unknown>),
    );
    const v = await this.drawers.drawer(d, kind, id);
    if (!v) throw ppErr(PP_ERRORS.NOT_FOUND, 'Not found', 404);
    return v;
  }

  @Get('options')
  async options(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    const d = await this.data.load(a, parsePpScope({}));
    const X = this.data;
    const active = d.emps.filter((e) => e.status !== 'Exited');
    const myLeave = d.cfg.leave.types.map((t) => ({
      v: t.key,
      t: t.name,
      bal: d.me ? X.bal(d, d.me.id, t.key) : null,
      ent: t.entitlement,
    }));
    return {
      me: { uid: a.userId, name: a.name, inStaff: !!d.me },
      rights: Object.fromEntries(
        Object.entries(a).filter(([, v]) => typeof v === 'boolean'),
      ),
      scope: a.scope,
      today: d.today,
      tz: d.tz,
      currency: d.fmt.base,
      period: d.period,
      periodLabel: d.period,
      members: active.map((e) => ({
        v: e.id,
        t: `${e.name}${e.dept ? ` · ${e.dept}` : ''}`,
        dept: e.dept,
        mgr: e.mgr,
      })),
      team: active
        .filter((e) => X.inScope(d, e.id, true))
        .map((e) => ({
          v: e.id,
          t: `${e.name}${e.dept ? ` · ${e.dept}` : ''}`,
        })),
      branches: d.group.map((g) => ({ v: g.id, t: g.name })),
      depts: X.depts(d),
      jobs: d.jobs.map((j) => ({
        v: j.id,
        t: `${j.title} · ${j.number}`,
        st: j.status,
        mgr: j.managerUserId,
      })),
      cands: d.cands
        .filter((c) => !['Hired', 'Rejected', 'Withdrawn'].includes(c.stage))
        .map((c) => ({
          v: c.id,
          t: `${c.name} · ${X.job(d, c.jobId)?.title ?? ''}`,
          stage: c.stage,
        })),
      courses: d.courses.map((c) => ({
        v: c.id,
        t: `${c.name} · ${c.type}`,
        roles: (c.roles as unknown as string[]) ?? [],
      })),
      runs: d.runs.map((r) => ({
        v: r.id,
        t: `${r.number} · ${r.status}`,
        period: r.period,
        final: !!r.finalizedAt,
        lines: r.lines.map((l) => ({
          v: l.userId,
          t: X.name(d, l.userId),
          payout: l.payout,
          net: a.salary ? Number(l.net ?? 0) : null,
        })),
      })),
      cycles: d.cycles.map((c) => ({ v: c.id, t: c.name, st: c.status })),
      rules: d.rules.map((r) => ({ v: r.id, t: r.name, method: r.method })),
      leaveTypes: myLeave,
      lists: {
        stages: STAGES,
        sources: SOURCES,
        empTypes: EMP_TYPES,
        workModes: WORK_MODES,
        rounds: ROUNDS,
        exitTypes: EXIT_TYPES,
        ruleTypes: RULE_TYPES,
        taxTreatments: TAX_TREATMENTS,
        courseTypes: COURSE_TYPES,
        basis: BASIS,
        taxStatus: TAX_STATUS,
      },
      competencies: d.cfg.recruiting.competencies,
      ratings: d.cfg.performance.ratings,
      tasksProject: !!d.cfg.tasks.projectId,
      careers: d.cfg.recruiting.careersEnabled ? { slug: d.biz.slug } : null,
      taxTable: !!X.taxTable(d),
    };
  }

  @Get('profile/:uid')
  async profile(
    @CurrentUser() u: AuthenticatedUser,
    @Param('uid') uid: string,
  ) {
    const a = await this.actor(u);
    return this.people.profile(a, uid === 'me' ? a.userId : uid);
  }

  @Post('profile/:uid')
  async saveProfile(
    @CurrentUser() u: AuthenticatedUser,
    @Param('uid') uid: string,
    @Body() b: ProfileDto,
  ) {
    const a = await this.actor(u);
    return this.people.save(a, uid === 'me' ? a.userId : uid, b);
  }

  @Get('export')
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PpScopeQuery,
    @Res() res: Response,
  ) {
    const f = await this.exporter.export(
      await this.actor(u),
      parsePpScope(q as Record<string, unknown>),
      q.what ?? 'employees',
      q.format ?? 'csv',
      q.pii === 'full',
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-Row-Count', String(f.rows));
    res.send(f.body);
  }

  // ── recruitment ───────────────────────────────────────────────────────

  @Post('jobs')
  async createJob(@CurrentUser() u: AuthenticatedUser, @Body() b: JobDto) {
    return this.recruit.createJob(await this.actor(u), b);
  }
  @Post('jobs/:id')
  async editJob(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: JobDto,
  ) {
    return this.recruit.editJob(await this.actor(u), id, b);
  }
  @Post('jobs/:id/act')
  async jobAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActDto,
  ) {
    return this.recruit.jobAction(
      await this.actor(u),
      id,
      b.act,
      b.reason ?? '',
    );
  }

  @Post('candidates')
  @UseInterceptors(FileInterceptor('file', MAX))
  async createCand(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    const a = await this.actor(u);
    return this.recruit.createCand(a, a.rootId, parse<CandIn>(b.data), up(f));
  }
  @Post('candidates/:id/stage')
  async stage(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: StageDto,
  ) {
    return this.recruit.moveStage(
      await this.actor(u),
      id,
      b.to,
      b.reason ?? '',
      b.expectedVersion,
    );
  }
  @Post('candidates/:id/reject')
  async reject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RejectDto,
  ) {
    return this.recruit.reject(
      await this.actor(u),
      id,
      b.reason,
      b.note,
      !!b.message,
    );
  }
  @Post('candidates/:id/message')
  async message(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: MessageDto,
  ) {
    return this.recruit.message(await this.actor(u), id, b.kind, b.text);
  }
  @Post('candidates/:id/resume')
  @UseInterceptors(FileInterceptor('file', MAX))
  async resume(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    const file = up(f);
    if (!file) throw ppErr(PP_ERRORS.INVALID, 'Choose a file.');
    return this.recruit.uploadResume(await this.actor(u), id, file);
  }
  @Get('candidates/:id/resume')
  async resumeLink(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.recruit.resumeLink(await this.actor(u), id);
  }
  @Get('candidates/:id/hire')
  async hireCheck(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(u);
    this.ctx.need(a, 'recruit', 'Hiring');
    const r = await this.people.hireCheck(a, id);
    return {
      offer: r.offer
        ? {
            number: r.offer.number,
            version: r.offer.version,
            startDate: r.offer.startDate.toISOString().slice(0, 10),
            type: r.offer.employmentType,
            frequency: r.offer.frequency,
          }
        : null,
      match: r.user
        ? {
            name: r.user.name,
            email: r.user.email,
            linked: !!r.link,
            active: !!r.link?.active,
          }
        : null,
      name: r.c.name,
    };
  }
  @Post('candidates/:id/hire')
  async hire(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: HireDto,
  ) {
    return this.people.hire(await this.actor(u), id, b.how ?? '');
  }

  @Post('interviews')
  async schedule(@CurrentUser() u: AuthenticatedUser, @Body() b: IntDto) {
    return this.recruit.schedule(await this.actor(u), null, b);
  }
  @Post('interviews/:id')
  async reschedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: IntDto,
  ) {
    return this.recruit.schedule(await this.actor(u), id, b);
  }
  @Post('interviews/:id/act')
  async intAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActDto,
  ) {
    const a = await this.actor(u);
    if (b.act === 'confirm') {
      this.ctx.need(a, 'interview', 'Sending confirmations');
      const s = await this.recruit.confirmMail(a, id);
      if (!s.ok)
        throw ppErr(
          PP_ERRORS.NOT_CONFIGURED,
          `Email couldn’t be sent (${s.error}). Nothing was delivered.`,
          502,
        );
      return { sent: true };
    }
    return this.recruit.intAction(a, id, b.act, b.reason ?? '');
  }
  @Post('interviews/:id/score')
  async score(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ScoreDto,
  ) {
    return this.recruit.scorecard(await this.actor(u), id, b.interviewer, b);
  }

  @Post('offers')
  async createOffer(@CurrentUser() u: AuthenticatedUser, @Body() b: OfferDto) {
    return this.recruit.createOffer(await this.actor(u), b);
  }
  @Post('offers/:id')
  async reviseOffer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: OfferDto,
  ) {
    return this.recruit.reviseOffer(await this.actor(u), id, b);
  }
  @Post('offers/:id/act')
  async offerAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActDto,
  ) {
    return this.recruit.offerAction(
      await this.actor(u),
      id,
      b.act,
      b.reason ?? '',
    );
  }
  @Get('offers/:id/document')
  async offerDoc(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.recruit.signedLink(await this.actor(u), id);
  }

  // ── onboarding ────────────────────────────────────────────────────────

  @Post('onboarding/:id/start')
  async onbStart(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.hr.onbStart(await this.actor(u), id);
  }
  @Post('onboarding/:id/tasks')
  async onbTasks(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.hr.onbTasks(await this.actor(u), id);
  }
  @Post('onboarding/:id/item')
  async onbItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: OnbItemDto,
  ) {
    return this.hr.onbItem(await this.actor(u), id, b.idx, b.override ?? '');
  }
  @Post('onboarding/:id/edit')
  async onbEdit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: OnbEditDto,
  ) {
    return this.hr.onbEdit(await this.actor(u), id, b);
  }
  @Post('onboarding/:id/docs')
  async onbDocs(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: TextDto,
  ) {
    return this.hr.onbDocs(await this.actor(u), id, b.text ?? '');
  }

  // ── leave ─────────────────────────────────────────────────────────────

  @Post('leave')
  @UseInterceptors(FileInterceptor('file', MAX))
  async leaveReq(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: FormDataDto,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    return this.leave.request(
      await this.actor(u),
      parse<LeaveIn>(b.data),
      up(f),
    );
  }
  @Post('leave/:id/act')
  async leaveAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: LeaveActDto,
  ) {
    return this.leave.decide(
      await this.actor(u),
      id,
      b.act,
      b.reason ?? '',
      b.expectedStatus,
    );
  }
  @Get('leave/:id/attachment')
  async leaveAtt(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.attachment(await this.actor(u), id);
  }

  // ── payroll ───────────────────────────────────────────────────────────

  @Post('runs')
  async startRun(@CurrentUser() u: AuthenticatedUser, @Body() b: RunStartDto) {
    return this.payroll.start(await this.actor(u), b.period);
  }
  @Post('runs/correction')
  async correction(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: CorrectionDto,
  ) {
    return this.payroll.correction(await this.actor(u), b.runId, b.ids);
  }
  @Post('runs/:id/act')
  async runAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActDto,
  ) {
    return this.payroll.act(await this.actor(u), id, b.act, b);
  }
  @Post('runs/:id/exception')
  async runExc(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ExcDto,
  ) {
    return this.payroll.exception(await this.actor(u), id, b.idx, b.how);
  }
  @Get('runs/:id/bank-file')
  async bankFile(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.bankFile(await this.actor(u), id);
  }
  @Post('readiness/fix')
  async fix(@CurrentUser() u: AuthenticatedUser, @Body() b: FixDto) {
    return this.payroll.requestFix(await this.actor(u), b.kind, b.ids);
  }
  @Post('payslips/:runId/:uid/deliver')
  async deliver(
    @CurrentUser() u: AuthenticatedUser,
    @Param('runId') runId: string,
    @Param('uid') uid: string,
  ) {
    return this.payroll.deliver(await this.actor(u), runId, uid);
  }
  @Post('payslips/deliver-all')
  async deliverAll(@CurrentUser() u: AuthenticatedUser) {
    return this.payroll.deliverAll(await this.actor(u));
  }
  @Get('payslips/:runId/:uid/pdf')
  async slipPdf(
    @CurrentUser() u: AuthenticatedUser,
    @Param('runId') runId: string,
    @Param('uid') uid: string,
  ) {
    return this.payroll.slipPdf(await this.actor(u), runId, uid);
  }

  // ── benefits ──────────────────────────────────────────────────────────

  @Post('rules')
  async createRule(@CurrentUser() u: AuthenticatedUser, @Body() b: RuleDto) {
    return this.payroll.createRule(await this.actor(u), b);
  }
  @Post('rules/:id/impact')
  async ruleImpact(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RuleDto,
  ) {
    return this.payroll.ruleImpact(await this.actor(u), id, b);
  }
  @Post('rules/:id/change')
  async ruleChange(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RuleDto,
  ) {
    return this.payroll.scheduleChange(await this.actor(u), id, b);
  }
  @Post('rules/:id/end')
  async ruleEnd(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: DateDto,
  ) {
    return this.payroll.deactivate(await this.actor(u), id, b.to);
  }
  @Post('rules/:id/assign')
  async ruleAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AssignDto,
  ) {
    return this.payroll.assign(await this.actor(u), id, b.ids, b.on);
  }
  @Post('rules/:id/assign-dept')
  async ruleDept(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: DeptDto,
  ) {
    return this.payroll.assignDept(await this.actor(u), id, b.dept);
  }

  // ── performance ───────────────────────────────────────────────────────

  @Post('cycles')
  async cycle(@CurrentUser() u: AuthenticatedUser, @Body() b: CycleDto) {
    return this.hr.cycle(await this.actor(u), b);
  }
  @Post('cycles/:id/act')
  async cycleAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: CycleActDto,
  ) {
    return this.hr.cycleAct(await this.actor(u), id, b.act, b.ids ?? []);
  }
  @Post('reviews/:id/act')
  async reviewAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ReviewActDto,
  ) {
    return this.hr.reviewAct(await this.actor(u), id, b.act, b);
  }

  // ── training ──────────────────────────────────────────────────────────

  @Post('courses')
  async course(@CurrentUser() u: AuthenticatedUser, @Body() b: CourseDto) {
    return this.hr.course(await this.actor(u), b);
  }
  @Post('training/assign')
  async assignTr(@CurrentUser() u: AuthenticatedUser, @Body() b: AssignTrDto) {
    const a = await this.actor(u);
    return b.byDept
      ? this.hr.assignByDept(a, b.courseId, b.dueDays ?? 14)
      : this.hr.assignTraining(a, b.courseId, b.ids ?? [], b.dueDays ?? 14);
  }
  @Post('training/:id/act')
  @UseInterceptors(FileInterceptor('file', MAX))
  async trAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: FormDataDto,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    const x = parse<{ act: string; score?: string; note?: string }>(b.data);
    return this.hr.trAct(await this.actor(u), id, x.act, x, up(f));
  }
  @Get('training/:id/certificate')
  async cert(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.hr.certLink(await this.actor(u), id);
  }

  // ── offboarding ───────────────────────────────────────────────────────

  @Post('offboarding')
  async ofbStart(@CurrentUser() u: AuthenticatedUser, @Body() b: OfbDto) {
    return this.hr.ofbStart(await this.actor(u), b);
  }
  @Post('offboarding/:id/act')
  async ofbAct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: ActDto,
  ) {
    return this.hr.ofbAct(await this.actor(u), id, b.act, {
      reason: b.reason,
      note: b.note,
      runId: b.runId,
    });
  }

  // ── settings ──────────────────────────────────────────────────────────

  @Get('settings')
  async settingsView(@CurrentUser() u: AuthenticatedUser) {
    return this.settings.view(await this.actor(u));
  }
  @Post('settings')
  async saveSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: PpSettingsDto,
  ) {
    return this.settings.save(
      await this.actor(u),
      b.section,
      b.values,
      b.expectedVersion,
    );
  }
}
