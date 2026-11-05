import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CustomerAgentActionsService } from './customer-agent-actions.service';
import {
  CompleteCustomerFollowUpDto,
  CreateCustomerFollowUpTaskDto,
  CreateCustomerMessageDraftDto,
  GenerateCustomerMessageDraftDto,
  UpdateCustomerMessageDraftDto,
} from './dto/customer-agent-actions.dto';

@Controller('customers')
@RequireCapability(CAPABILITIES.CUSTOMER_AGENT_RUN)
export class CustomerAgentActionsController {
  constructor(private readonly actions: CustomerAgentActionsService) {}

  @Get('follow-up-outcomes')
  followUpOutcomeSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.actions.followUpOutcomeSummary(user.businessId);
  }

  @Get(':id/follow-up-tasks')
  listTasks(@Param('id') customerId: string) {
    return this.actions.listTasks(customerId);
  }

  @Post(':id/follow-up-tasks')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Body() input: CreateCustomerFollowUpTaskDto,
  ) {
    return this.actions.createTask(
      user.businessId,
      user.sub,
      customerId,
      input,
    );
  }

  @Post('agent-recommendations/:recommendationId/follow-up-task')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  createTaskFromAgentRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recommendationId') recommendationId: string,
  ) {
    return this.actions.createTaskFromRecommendation(
      user.businessId,
      user.sub,
      recommendationId,
    );
  }

  @Post('agent-recommendations/:recommendationId/follow-up-task-action')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  proposeTaskFromAgentRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recommendationId') recommendationId: string,
  ) {
    return this.actions.proposeTaskFromRecommendation(
      user.businessId,
      user.sub,
      recommendationId,
    );
  }

  @Get(':id/agent-message-drafts')
  listMessageDrafts(@Param('id') customerId: string) {
    return this.actions.listMessageDrafts(customerId);
  }

  @Post(':id/agent-message-drafts')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  createMessageDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Body() input: CreateCustomerMessageDraftDto,
  ) {
    return this.actions.createMessageDraft(
      user.businessId,
      user.sub,
      customerId,
      input,
    );
  }

  @Post(':id/agent-message-drafts/generate')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  generateMessageDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Body() input: GenerateCustomerMessageDraftDto,
  ) {
    return this.actions.generateMessageDraft(
      user.businessId,
      user.sub,
      customerId,
      input,
    );
  }

  @Patch(':id/agent-message-drafts/:draftId')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  updateMessageDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Param('draftId') draftId: string,
    @Body() input: UpdateCustomerMessageDraftDto,
  ) {
    return this.actions.updateMessageDraft(
      user.businessId,
      user.sub,
      customerId,
      draftId,
      input,
    );
  }

  @Post(':id/agent-message-drafts/:draftId/preview-send')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  previewMessageDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.actions.previewMessageDraft(
      user.businessId,
      customerId,
      draftId,
    );
  }

  @Post(':id/agent-message-drafts/:draftId/queue-send')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  queueMessageDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.actions.queueMessageDraft(
      user.businessId,
      user.sub,
      customerId,
      draftId,
    );
  }
}

/** Staff can complete only a task assigned to their active BusinessUser row. */
@Controller('customers/follow-up-tasks')
export class CustomerFollowUpTaskActionsController {
  constructor(private readonly actions: CustomerAgentActionsService) {}

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') taskId: string,
    @Body() input: CompleteCustomerFollowUpDto,
  ) {
    return this.actions.completeTask(
      user.businessId,
      user.sub,
      taskId,
      input?.outcome,
    );
  }
}
