import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  CreateVoiceBillingDraftDto,
  VoiceBillingDecisionDto,
} from './dto/voice-usage-billing.dto';
import { VoiceUsageBillingService } from './voice-usage-billing.service';
import { VoiceUsageBillingHandoffService } from './voice-usage-billing-handoff.service';

@Controller('billing/voice-usage')
export class VoiceUsageBillingController {
  constructor(
    private readonly service: VoiceUsageBillingService,
    private readonly handoff: VoiceUsageBillingHandoffService,
  ) {}

  @Get()
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: string,
  ) {
    return this.service.overview(user.businessId, month);
  }

  @Post('rates/capture')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  capture(@CurrentUser() user: AuthenticatedUser) {
    return this.service.captureRates(user.businessId, user.sub);
  }

  @Post('rates/:id/approve')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  approveRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceBillingDecisionDto,
  ) {
    return this.service.approveRates(user.businessId, user.sub, id, dto.reason);
  }

  @Post('drafts')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceBillingDraftDto,
  ) {
    return this.service.createDraft(
      user.businessId,
      user.sub,
      dto.rateVersionId,
      dto.month,
    );
  }

  @Get('drafts/:id')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.detail(user.businessId, id);
  }

  @Post('drafts/:id/approve')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  approveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceBillingDecisionDto,
  ) {
    return this.service.decideDraft(
      user.businessId,
      user.sub,
      id,
      'approved',
      dto.reason,
    );
  }

  @Post('drafts/:id/cancel')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  cancelDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceBillingDecisionDto,
  ) {
    return this.service.decideDraft(
      user.businessId,
      user.sub,
      id,
      'cancelled',
      dto.reason,
    );
  }

  /** Sends an approved draft to Stripe once, as a pending invoice item on the next invoice. */
  @Post('drafts/:id/post')
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  postDraft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.handoff.post(user.businessId, user.sub, id);
  }
}
