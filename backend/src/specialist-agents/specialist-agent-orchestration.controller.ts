import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SpecialistAgentOrchestrationService } from './specialist-agent-orchestration.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';

@RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
@Controller('ai/specialist-orchestrations')
export class SpecialistAgentOrchestrationController {
  constructor(
    private readonly orchestration: SpecialistAgentOrchestrationService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    this.assertOwner(user);
    return this.orchestration.listRuns(user.businessId);
  }

  @Post()
  @Audited('specialist_agent.orchestration_started', 'SpecialistAgentRun')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    this.assertOwner(user);
    return this.orchestration.run(user.businessId, user.sub, idempotencyKey);
  }

  @Post(':id/retry-failed')
  @Audited('specialist_agent.orchestration_retry_started', 'SpecialistAgentRun')
  retryFailed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    this.assertOwner(user);
    return this.orchestration.retryFailed(
      user.businessId,
      user.sub,
      runId,
      idempotencyKey,
    );
  }

  @Post(':id/cancel')
  @Audited(
    'specialist_agent.orchestration_cancel_requested',
    'SpecialistAgentRun',
  )
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') runId: string) {
    this.assertOwner(user);
    return this.orchestration.cancelRun(user.businessId, runId, user.sub);
  }

  private assertOwner(user: AuthenticatedUser) {
    if (user.role !== Role.owner) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_OWNER_REQUIRED',
        'Only the business owner can run a review across all enabled specialists because it includes finance and customer summaries.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
