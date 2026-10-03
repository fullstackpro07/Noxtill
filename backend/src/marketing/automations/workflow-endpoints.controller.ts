import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { WorkflowEndpointsService } from './workflow-endpoints.service';

class SetEndpointEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/** Authenticated management of inbound webhook endpoints. */
@Controller('workflows/endpoints')
export class WorkflowEndpointsController {
  constructor(private readonly endpoints: WorkflowEndpointsService) {}

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.endpoints.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Get('deliveries')
  deliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workflowId') workflowId?: string,
  ) {
    return this.endpoints.deliveries(user.businessId, workflowId || undefined);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':workflowId/token')
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workflowId') workflowId: string,
  ) {
    return this.endpoints.issueToken(user.businessId, workflowId);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':workflowId/enabled')
  setEnabled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: SetEndpointEnabledDto,
  ) {
    return this.endpoints.setEnabled(user.businessId, workflowId, dto.enabled);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post('deliveries/:deliveryId/replay')
  replay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.endpoints.replay(user.businessId, deliveryId);
  }
}

/** Public receiver: the URL token is the credential; the business is never taken from the caller. */
@Controller('public/workflow-hooks')
export class WorkflowHookReceiverController {
  constructor(private readonly endpoints: WorkflowEndpointsService) {}

  @Public()
  @Post(':token')
  @HttpCode(202)
  receive(
    @Param('token') token: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.endpoints.receive(token, body, idempotencyKey);
  }
}
