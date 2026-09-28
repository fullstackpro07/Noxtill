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
} from '@nestjs/common';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { BrainViewsService } from './brain-views.service';
import { BrainActionsService } from './brain-actions.service';
import { BrainAskService } from './brain-ask.service';
import { BrainCauseService, topicFor } from './brain-cause.service';
import { BrainContextService } from './brain-context.service';
import { BrainDecisionsService } from './brain-decisions.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainWatchService } from './brain-watch.service';
import { BRAIN_ERRORS, WATCH_METRICS } from './brain.constants';
import type { DiagnoseTopic } from './brain.types';

class ScopeDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['week', 'yesterday', 'month', 'custom'])
  compare?: 'week' | 'yesterday' | 'month' | 'custom';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

class CauseQueryDto extends ScopeDto {
  @IsOptional()
  @IsIn(['profit', 'revenue', 'repeat', 'credit', 'margin'])
  topic?: DiagnoseTopic;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  q?: string;
}

class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

class PrepareDto {
  @IsString()
  findingKey!: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

class EditActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

class FindingDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

class WatchDto {
  @IsIn(Object.keys(WATCH_METRICS))
  metric!: keyof typeof WATCH_METRICS;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsIn(['lt', 'gt', 'outside'])
  op!: 'lt' | 'gt' | 'outside';

  @Type(() => Number)
  @IsNumber()
  threshold!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold2?: number;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  label?: string;
}

class RuleDto {
  @IsString()
  key!: string;

  @Type(() => Number)
  @IsNumber()
  value!: number;
}

/** Business Brain. Auth and tenancy are global guards; approvals are checked per action inside the service. */
@Controller('brain')
export class BrainController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly views: BrainViewsService,
    private readonly actions: BrainActionsService,
    private readonly ask: BrainAskService,
    private readonly cause: BrainCauseService,
    private readonly context: BrainContextService,
    private readonly decisions: BrainDecisionsService,
    private readonly detectors: BrainDetectorsService,
    private readonly watch: BrainWatchService,
  ) {}

  @Get('scope')
  async scope(@CurrentUser() user: AuthenticatedUser) {
    const group = await this.branchScope.resolveIds(user.businessId, 'all');
    const branches = await this.prisma.business.findMany({
      where: { id: { in: group } },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });
    return {
      own: user.businessId,
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        isRoot: !b.parentId,
      })),
    };
  }

  @Get('command')
  command(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.command(user, q);
  }

  @Get('situation')
  situation(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.situation(user, q);
  }

  @Get('cause')
  async investigate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: CauseQueryDto,
  ) {
    const topic = q.topic ?? (q.q ? topicFor(q.q) : 'profit');
    if (!topic)
      throw new AppException(
        BRAIN_ERRORS.BAD_RULE,
        'That question is not one Business Brain can break down yet. Ask it at the top of the Command Center instead.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const ctx = await this.context.build(user, q);
    const r = await this.cause.investigate(ctx, topic, q.q ?? '');
    if (q.q)
      await this.ask.logWhy(
        user,
        q.q,
        r.reading
          ? `${r.headline}. ${r.reading.main.t} — ${r.reading.main.d}`
          : `${r.headline}. ${r.body}`,
        topic,
      );
    return r;
  }

  @Post('ask')
  askQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskDto) {
    return this.ask.ask(user, dto.question, { branch: dto.branch });
  }

  @Get('opportunity')
  opportunity(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.opportunity(user, q);
  }

  @Get('outlook')
  outlook(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.outlook(user, q);
  }

  @Get('decisions')
  decisionsView(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.decisionsView(user, q);
  }

  @Get('actions')
  listActions(@CurrentUser() user: AuthenticatedUser) {
    return this.actions.list(user);
  }

  @Post('actions/prepare')
  prepare(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareDto) {
    return this.actions.prepare(user, dto.findingKey, { branch: dto.branch });
  }

  @Patch('actions/:id')
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditActionDto,
  ) {
    return this.actions.edit(user, id, dto.body);
  }

  @Post('actions/:id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actions.approve(user, id);
  }

  @Post('actions/:id/run')
  run(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actions.run(user, id);
  }

  @Post('actions/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actions.cancel(user, id);
  }

  @Post('findings/:key/watch')
  async watchFinding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: FindingDto,
  ) {
    await this.decisions.setState(user, key, 'watching', dto.title);
    const ctx = await this.context.build(user, { branch: dto.branch });
    const finding = (await this.detectors.read(ctx)).findings.find(
      (f) => f.key === key,
    );
    const ruled = finding ? await this.watch.fromFinding(user, finding) : false;
    return { ok: true, rule: ruled };
  }

  @Post('findings/:key/dismiss')
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: FindingDto,
  ) {
    await this.decisions.setState(
      user,
      key,
      'dismissed',
      dto.title,
      dto.reason,
    );
    return { ok: true };
  }

  @Post('findings/:key/restore')
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
  ) {
    await this.decisions.restore(user, key);
    return { ok: true };
  }

  @Get('watches')
  watches(@CurrentUser() user: AuthenticatedUser) {
    return this.watch.list(user);
  }

  @Get('watch-options')
  async watchOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
  ) {
    const term = q?.trim();
    const [products, customers, group] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          businessId: user.businessId,
          active: true,
          kind: 'product',
          ...(term ? { name: { contains: term } } : {}),
        },
        select: { id: true, name: true, stockQty: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      this.prisma.customer.findMany({
        where: {
          businessId: user.businessId,
          ...(term
            ? {
                OR: [
                  { name: { contains: term } },
                  { phone: { contains: term } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      this.branchScope.resolveIds(user.businessId, 'all'),
    ]);
    const branches =
      group.length > 1
        ? await this.prisma.business.findMany({
            where: { id: { in: group } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
    return {
      metrics: Object.entries(WATCH_METRICS).map(([k, v]) => ({
        key: k,
        ...v,
      })),
      products,
      customers,
      branches,
    };
  }

  @Post('watches')
  createWatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: WatchDto) {
    return this.watch.create(user, dto);
  }

  @Delete('watches/:id')
  removeWatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.watch.remove(user, id);
  }

  @Get('memory')
  memory(@CurrentUser() user: AuthenticatedUser) {
    return this.views.memory(user);
  }

  @RequireCapability(CAPABILITIES.BRAIN_APPROVE)
  @Patch('memory/rules')
  setRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: RuleDto) {
    return this.views.setRule(user, dto.key, dto.value);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.views.history(user);
  }

  @Get('governance')
  governance(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeDto) {
    return this.views.governance(user, q);
  }
}
