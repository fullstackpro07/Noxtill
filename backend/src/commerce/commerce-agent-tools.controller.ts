import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import {
  IsObject,
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Audited } from '../common/decorators/audited.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CommerceAgentToolsService } from './commerce-agent-tools.service';
import { CommerceSpecialistAgentService } from './commerce-specialist-agent.service';

class RunToolDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

class AgentToolDecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

class CommerceAgentQuestionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(1_000)
  question!: string;
}

class CommerceOrderOrchestrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  orderId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  destinationCountry?: string;
}

class CommerceProductSourcingOrchestrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  opportunityId!: string;
}

@Controller('commerce/agent-tools')
export class CommerceAgentToolsController {
  constructor(
    private readonly tools: CommerceAgentToolsService,
    private readonly specialist: CommerceSpecialistAgentService,
  ) {}

  @Get()
  registry(@CurrentUser() user: AuthenticatedUser) {
    return this.tools.registry(user.businessId);
  }

  @Get('runs')
  runs(@CurrentUser() user: AuthenticatedUser) {
    return this.tools.runs(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('runs/:id/approve')
  approveRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AgentToolDecisionDto,
  ) {
    return this.tools.approveRun(user.businessId, user.sub, id, dto.reason);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('runs/:id/reject')
  rejectRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AgentToolDecisionDto,
  ) {
    return this.tools.rejectRun(user.businessId, user.sub, id, dto.reason);
  }

  @Get('specialist-runs')
  specialistRuns() {
    return this.specialist.listRuns();
  }

  @RequireCapability(CAPABILITIES.COMMERCE_AGENT_RUN)
  @Post('specialist-runs')
  runSpecialist(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.specialist.run(user.businessId, user.sub, idempotencyKey);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_AGENT_RUN)
  @Post('specialist-runs/order-fulfillment')
  @Audited(
    'commerce.agent_order_fulfillment_orchestration_started',
    'SpecialistAgentRun',
  )
  orchestrateOrderFulfillment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommerceOrderOrchestrationDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.specialist.orchestrateOrderFulfillment(
      user.businessId,
      user.sub,
      dto,
      idempotencyKey,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_AGENT_RUN)
  @Post('specialist-runs/product-sourcing')
  @Audited(
    'commerce.agent_product_sourcing_orchestration_started',
    'SpecialistAgentRun',
  )
  orchestrateProductSourcing(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommerceProductSourcingOrchestrationDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.specialist.orchestrateProductSourcing(
      user.businessId,
      user.sub,
      dto,
      idempotencyKey,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('specialist-runs/ask')
  askSpecialist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommerceAgentQuestionDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.specialist.ask(
      user.businessId,
      user.sub,
      dto.question,
      idempotencyKey,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':key/run')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: RunToolDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.tools.run(
      user.businessId,
      user.sub,
      key,
      dto.input ?? {},
      idempotencyKey,
    );
  }
}
