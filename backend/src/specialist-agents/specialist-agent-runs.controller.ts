import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentRunsService } from './specialist-agent-runs.service';
import { ListSpecialistAgentRunsDto } from './dto/list-specialist-agent-runs.dto';
import { ListSpecialistAgentRunEventsDto } from './dto/list-specialist-agent-run-events.dto';

@RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
@Controller('agent-runs')
export class SpecialistAgentRunsController {
  constructor(private readonly runs: SpecialistAgentRunsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSpecialistAgentRunsDto,
  ) {
    this.assertOwner(user);
    return this.runs.list(user.businessId, query);
  }

  @Get(':id/evidence')
  evidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
    @Query('cursor') cursor?: string,
  ) {
    this.assertOwner(user);
    return this.runs.listEvidence(user.businessId, runId, cursor);
  }

  @Get(':id/tool-calls')
  toolCalls(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    this.assertOwner(user);
    return this.runs.listToolCalls(user.businessId, runId);
  }

  @Get(':id/events')
  events(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
    @Query() query: ListSpecialistAgentRunEventsDto,
  ) {
    this.assertOwner(user);
    return this.runs.listEvents(user.businessId, runId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') runId: string) {
    this.assertOwner(user);
    return this.runs.get(user.businessId, runId);
  }

  private assertOwner(user: AuthenticatedUser) {
    if (user.role !== Role.owner) {
      throw new AppException(
        'SPECIALIST_RUN_OWNER_REQUIRED',
        'Only the business owner can review cross-module specialist run details.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
