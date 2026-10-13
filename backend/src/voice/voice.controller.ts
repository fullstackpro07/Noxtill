import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { TelephonyService } from './telephony.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceQueryService } from './voice-query.service';
import { VoiceSettingsService } from './voice-settings.service';
import { VoiceQueueService } from './voice-queue.service';
import {
  VoiceLiveJoinService,
  type JoinRole,
  type SupervisorCoachMode,
} from './voice-live-join.service';
import { VoiceCallWorkspaceService } from './voice-call-workspace.service';
import { VoiceRoutingRulesService } from './voice-routing-rules.service';
import { VoiceKnowledgeService } from './voice-knowledge.service';
import { PollyVoiceService } from './polly-voice.service';
import { UpdateVoiceSettingsDto } from './dto/update-voice-settings.dto';
import { AssignCallDto } from './dto/assign-call.dto';
import {
  AddCallNoteDto,
  TransferLiveCallDto,
} from './dto/call-workspace-actions.dto';
import {
  CreateRoutingRuleDto,
  ReorderRoutingRulesDto,
  UpdateRoutingRuleDto,
} from './dto/routing-rule.dto';
import {
  CreateKnowledgeEntryDto,
  UpdateKnowledgeEntryDto,
} from './dto/knowledge-entry.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { VoiceInsightsService } from './voice-insights.service';
import { VoiceAgentsService } from './voice-agents.service';
import { VoiceAiAgentsService } from './voice-ai-agents.service';
import { VoiceCallWrapUpService } from './voice-call-wrap-up.service';
import {
  SaveVoiceHumanAgentProfileDto,
  VoicePresenceHeartbeatDto,
} from './dto/voice-agent.dto';
import {
  RollbackVoiceAiAgentDto,
  SaveVoiceAiAgentDraftDto,
  TestVoiceAiAgentDto,
} from './dto/voice-ai-agent.dto';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SubmitVoiceCallWrapUpDto } from './dto/voice-call-wrap-up.dto';
import { verifyTwilioSignature } from '../common/webhooks/signature.util';
import { VoiceCopilotService } from './voice-copilot.service';
import { VoiceQualityService } from './voice-quality.service';
import {
  AssignVoiceQualityReviewDto,
  OverrideVoiceQualityReviewDto,
  SaveVoiceQualityReviewDto,
  SaveVoiceQualityRubricDto,
} from './dto/voice-quality.dto';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceMeetingsService } from './voice-meetings.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';
import { VoiceIvrService } from './voice-ivr.service';
import { VoiceSupervisorService } from './voice-supervisor.service';
import { VoiceTrackingService } from './voice-tracking.service';
import {
  AddVoiceTrackingNumberDto,
  AssignVoiceTrackingNumberDto,
  DeactivateVoiceTrackingNumberDto,
  OverrideVoiceCallAttributionDto,
} from './dto/voice-tracking.dto';
import { VoiceTrackingNumbersService } from './voice-tracking-numbers.service';
import {
  CreateVoiceIvrFlowDto,
  PublishVoiceIvrFlowDto,
  RollbackVoiceIvrFlowDto,
  SaveVoiceIvrDraftDto,
  SimulateVoiceIvrFlowDto,
} from './dto/voice-ivr.dto';
import {
  CreateVoiceOutboundCampaignDto,
  UpdateVoiceOutboundCampaignDto,
  VoiceDialerAttemptDto,
  VoiceDialerDispositionDto,
} from './dto/voice-outbound.dto';
import { VoiceOutboundDialerService } from './voice-outbound-dialer.service';
import {
  CreateVoiceMeetingDto,
  CreateVoiceMeetingInviteDto,
  RescheduleVoiceMeetingDto,
  VoiceMeetingReasonDto,
} from './dto/voice-meeting.dto';
import {
  CheckVoiceEligibilityDto,
  CreateVoiceCompliancePolicyDto,
  CreateVoiceCompliancePolicyVersionDto,
  CreateVoiceConsentEvidenceDto,
  CreateVoiceSuppressionDto,
  DisableVoiceCompliancePolicyDto,
  PublishVoiceCompliancePolicyDto,
  RevokeVoiceConsentDto,
  RevokeVoiceSuppressionDto,
} from './dto/voice-compliance.dto';

@Controller()
export class VoiceController {
  constructor(
    private readonly telephony: TelephonyService,
    private readonly voiceCall: VoiceCallService,
    private readonly voiceQuery: VoiceQueryService,
    private readonly voiceInsights: VoiceInsightsService,
    private readonly voiceSettings: VoiceSettingsService,
    private readonly voiceQueue: VoiceQueueService,
    private readonly voiceLiveJoin: VoiceLiveJoinService,
    private readonly voiceWorkspace: VoiceCallWorkspaceService,
    private readonly voiceRoutingRules: VoiceRoutingRulesService,
    private readonly voiceKnowledge: VoiceKnowledgeService,
    private readonly pollyVoice: PollyVoiceService,
    private readonly config: ConfigService,
    private readonly voiceAgents: VoiceAgentsService,
    private readonly voiceAiAgents: VoiceAiAgentsService,
    private readonly voiceCallWrapUp: VoiceCallWrapUpService,
    private readonly voiceCopilot: VoiceCopilotService,
    private readonly voiceQuality: VoiceQualityService,
    private readonly voiceCompliance: VoiceComplianceService,
    private readonly voiceMeetings: VoiceMeetingsService,
    private readonly voiceOutboundCampaigns: VoiceOutboundCampaignService,
    private readonly voiceDialer: VoiceOutboundDialerService,
    private readonly voiceIvr: VoiceIvrService,
    private readonly voiceSupervisor: VoiceSupervisorService,
    private readonly voiceTracking: VoiceTrackingService,
    private readonly voiceTrackingNumbers: VoiceTrackingNumbersService,
  ) {}

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/compliance/overview')
  voiceComplianceOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceCompliance.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/compliance/policy-packs')
  voiceCompliancePolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceCompliance.listPolicies(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/policy-packs')
  createVoiceCompliancePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceCompliancePolicyDto,
  ) {
    return this.voiceCompliance.createPolicy(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/policy-packs/:id/versions')
  createVoiceCompliancePolicyVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVoiceCompliancePolicyVersionDto,
  ) {
    return this.voiceCompliance.createPolicyVersion(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/policy-versions/:id/publish')
  publishVoiceCompliancePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishVoiceCompliancePolicyDto,
  ) {
    return this.voiceCompliance.publishPolicyVersion(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/policy-packs/:id/disable')
  disableVoiceCompliancePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisableVoiceCompliancePolicyDto,
  ) {
    return this.voiceCompliance.disablePolicy(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/compliance/consents')
  listVoiceConsentEvidence(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceCompliance.listConsents(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/consents')
  recordVoiceConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceConsentEvidenceDto,
  ) {
    return this.voiceCompliance.recordConsent(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/consents/:id/revoke')
  revokeVoiceConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RevokeVoiceConsentDto,
  ) {
    return this.voiceCompliance.revokeConsent(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/compliance/suppressions')
  listVoiceSuppressions(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceCompliance.listSuppressions(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/suppressions')
  addVoiceSuppression(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceSuppressionDto,
  ) {
    return this.voiceCompliance.addSuppression(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/suppressions/:id/revoke')
  revokeVoiceSuppression(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RevokeVoiceSuppressionDto,
  ) {
    return this.voiceCompliance.revokeSuppression(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/compliance/eligibility/check')
  checkVoiceEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckVoiceEligibilityDto,
  ) {
    return this.voiceCompliance.checkEligibility(
      user.businessId,
      user.sub,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/compliance/audit')
  voiceComplianceAudit(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceCompliance.listAudit(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/meetings/hosts')
  voiceMeetingHosts(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceMeetings.listHosts(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/meetings')
  listVoiceMeetings(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceMeetings.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/meetings')
  createVoiceMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceMeetingDto,
  ) {
    return this.voiceMeetings.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/meetings/:id')
  rescheduleVoiceMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleVoiceMeetingDto,
  ) {
    return this.voiceMeetings.reschedule(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/meetings/:id/cancel')
  cancelVoiceMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceMeetingReasonDto,
  ) {
    return this.voiceMeetings.cancel(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/meetings/:id/invites')
  createVoiceMeetingInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVoiceMeetingInviteDto,
  ) {
    return this.voiceMeetings.createInvite(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/meetings/:id/invites/:inviteId/revoke')
  revokeVoiceMeetingInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Body() dto: VoiceMeetingReasonDto,
  ) {
    return this.voiceMeetings.revokeInvite(
      user.businessId,
      user.sub,
      id,
      inviteId,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/outbound/audience')
  outboundAudience(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceOutboundCampaigns.audience(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/outbound/agents')
  outboundAgents(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceOutboundCampaigns.agents(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/campaigns')
  listVoiceOutboundCampaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceOutboundCampaigns.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/campaigns')
  createVoiceOutboundCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceOutboundCampaignDto,
  ) {
    return this.voiceOutboundCampaigns.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/campaigns/:id')
  updateVoiceOutboundCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVoiceOutboundCampaignDto,
  ) {
    return this.voiceOutboundCampaigns.updateDraft(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/campaigns/:id/eligibility-preview')
  previewVoiceOutboundCampaignEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceOutboundCampaigns.eligibilityPreview(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/campaigns/:id/start')
  startVoiceOutboundCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceDialer.start(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/campaigns/:id/pause')
  pauseVoiceOutboundCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceDialer.pause(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/campaigns/:id/stop')
  stopVoiceOutboundCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceDialer.stop(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/campaigns/:id/attempts')
  voiceOutboundCampaignAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceDialer.status(user.businessId, id);
  }

  /** Power dialer: ungated like presence, but every call is scoped to the campaign's assigned agent. */
  @Get('voice/campaigns/:id/dialer/next')
  voiceDialerNext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceDialer.next(user.businessId, user.sub, id);
  }

  @Post('voice/campaigns/:id/dialer/attempt')
  voiceDialerAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceDialerAttemptDto,
  ) {
    return this.voiceDialer.attempt(
      user.businessId,
      user.sub,
      id,
      dto.memberId,
    );
  }

  @Post('voice/campaigns/:id/dialer/skip')
  voiceDialerSkip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceDialerAttemptDto,
  ) {
    return this.voiceDialer.skip(user.businessId, user.sub, id, dto.memberId);
  }

  @Post('voice/dialer/attempts/:id/disposition')
  voiceDialerDisposition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoiceDialerDispositionDto,
  ) {
    return this.voiceDialer.disposition(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/ivr/flows')
  listVoiceIvrFlows(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceIvr.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/ivr/flows')
  createVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoiceIvrFlowDto,
  ) {
    return this.voiceIvr.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/ivr/flows/:id')
  getVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceIvr.detail(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Put('voice/ivr/flows/:id/draft')
  saveVoiceIvrDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVoiceIvrDraftDto,
  ) {
    return this.voiceIvr.saveDraft(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/ivr/flows/:id/validate')
  validateVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceIvr.validate(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/ivr/flows/:id/simulate')
  simulateVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SimulateVoiceIvrFlowDto,
  ) {
    return this.voiceIvr.simulate(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/ivr/flows/:id/publish')
  publishVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishVoiceIvrFlowDto,
  ) {
    return this.voiceIvr.publish(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/ivr/flows/:id/rollback')
  rollbackVoiceIvrFlow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RollbackVoiceIvrFlowDto,
  ) {
    return this.voiceIvr.rollback(user.businessId, user.sub, id, dto);
  }

  @Public()
  @Get('voice/meeting-invites/:token')
  previewVoiceMeetingInvite(@Param('token') token: string) {
    return this.voiceMeetings.previewInvite(token);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/quality/overview')
  voiceQualityOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceQuality.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/quality/rubrics')
  voiceQualityRubrics(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceQuality.listRubrics(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/rubrics')
  createVoiceQualityRubric(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveVoiceQualityRubricDto,
  ) {
    return this.voiceQuality.createRubric(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/rubrics/:id/versions')
  createVoiceQualityRubricVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVoiceQualityRubricDto,
  ) {
    return this.voiceQuality.createDraftVersion(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/rubric-versions/:id/publish')
  publishVoiceQualityRubricVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceQuality.publishVersion(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/quality/reviews')
  voiceQualityReviews(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceQuality.listReviews(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/reviews/:id/ai-suggestions')
  suggestVoiceQualityReviewScores(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceQuality.suggestReviewScores(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/calls/:callId/reviews')
  startVoiceQualityReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId') callId: string,
  ) {
    return this.voiceQuality.startReview(user.businessId, user.sub, callId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/quality/reviews/:id')
  saveVoiceQualityReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVoiceQualityReviewDto,
  ) {
    return this.voiceQuality.saveReview(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/reviews/:id/submit')
  submitVoiceQualityReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceQuality.submitReview(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/reviews/:id/override')
  overrideVoiceQualityReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OverrideVoiceQualityReviewDto,
  ) {
    return this.voiceQuality.overrideReview(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/quality/reviews/:id/assign')
  assignVoiceQualityReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignVoiceQualityReviewDto,
  ) {
    return this.voiceQuality.assignReview(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/agents')
  listVoiceAgents(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceAgents.list(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.VOICE_SUPERVISE)
  @Get('voice/supervisor/live')
  liveSupervisorCenter(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceSupervisor.live(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/tracking/overview')
  voiceTrackingOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.voiceTracking.overview(user.businessId, days);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/tracking/calls/:id/override')
  overrideVoiceCallAttribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OverrideVoiceCallAttributionDto,
  ) {
    return this.voiceTracking.overrideAttribution(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/tracking/numbers')
  listVoiceTrackingNumbers(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceTrackingNumbers.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/tracking/numbers')
  addVoiceTrackingNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddVoiceTrackingNumberDto,
  ) {
    return this.voiceTrackingNumbers.add(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/tracking/numbers/:id/assign')
  assignVoiceTrackingNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignVoiceTrackingNumberDto,
  ) {
    return this.voiceTrackingNumbers.assign(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/tracking/numbers/:id/deactivate')
  deactivateVoiceTrackingNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DeactivateVoiceTrackingNumberDto,
  ) {
    return this.voiceTrackingNumbers.deactivate(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Get('voice/agents/ai')
  listVoiceAiAgents(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceAiAgents.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai')
  createVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveVoiceAiAgentDraftDto,
  ) {
    return this.voiceAiAgents.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Put('voice/agents/ai/:id/draft')
  saveVoiceAiAgentDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVoiceAiAgentDraftDto,
  ) {
    return this.voiceAiAgents.saveDraft(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai/:id/test')
  testVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TestVoiceAiAgentDto,
  ) {
    return this.voiceAiAgents.testDraft(
      user.businessId,
      user.sub,
      id,
      dto.scenario,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai/:id/approve')
  approveVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceAiAgents.approve(user.businessId, user.sub, user.role, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai/:id/publish')
  publishVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceAiAgents.publish(user.businessId, user.sub, user.role, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai/:id/rollback')
  rollbackVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RollbackVoiceAiAgentDto,
  ) {
    return this.voiceAiAgents.rollback(
      user.businessId,
      user.sub,
      user.role,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/agents/ai/:id/pause')
  pauseVoiceAiAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceAiAgents.pause(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Put('voice/agents/human/:staffUserId')
  saveHumanAgentProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffUserId') staffUserId: string,
    @Body() dto: SaveVoiceHumanAgentProfileDto,
  ) {
    return this.voiceAgents.saveProfile(user.businessId, staffUserId, dto);
  }

  @Post('voice/agents/presence/heartbeat')
  updateVoicePresence(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoicePresenceHeartbeatDto,
  ) {
    return this.voiceAgents.heartbeat(user.businessId, user.sub, dto);
  }

  @Get('voice/number')
  getNumber(@CurrentUser() user: AuthenticatedUser) {
    return this.telephony.getNumber(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/provision-number')
  provisionNumber(@CurrentUser() user: AuthenticatedUser) {
    return this.telephony.provisionNumber(user.businessId);
  }

  /** The AI Phone workspace's single read: recent calls enriched with customer match, repeat-caller and after-hours facts. */
  @Get('voice/insights')
  insights(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.voiceInsights.insights(
      user.businessId,
      days ? Number(days) : undefined,
    );
  }

  @Get('voice/calls/:id/context')
  callContext(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.voiceInsights.context(user.businessId, id);
  }

  /** Knowledge/Quality screens' real "top question clusters" table. */
  @Get('voice/clusters')
  clusters(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.voiceInsights.questionClusters(
      user.businessId,
      days ? Number(days) : undefined,
    );
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/assign')
  assignCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AssignCallDto,
  ) {
    return this.voiceInsights.assign(user.businessId, id, body.userId ?? null);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/summary')
  summariseCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceInsights.generateSummary(user.businessId, id);
  }

  @Get('voice/calls')
  listCalls() {
    return this.voiceQuery.listCalls();
  }

  /** Route-consistency fix — was `missed-calls` (no `voice/` prefix), inconsistent with every other route in this controller. */
  @Get('voice/missed-calls')
  listMissedCalls() {
    return this.voiceQuery.listMissedCalls();
  }

  @Get('voice/analytics')
  analytics() {
    return this.voiceQuery.analytics();
  }

  /** Registered before nothing dynamic collides — `:id` here is scoped under `voice/calls/`, distinct from the other top-level `voice/*` static routes. */
  @Get('voice/calls/:id/recording-url')
  getRecordingUrl(@Param('id') id: string) {
    return this.voiceQuery.getRecordingUrl(id);
  }

  @Get('voice/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceSettings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateVoiceSettingsDto,
  ) {
    return this.voiceSettings.update(user.businessId, dto);
  }

  /** Receptionist Settings depth fix — a real Polly-synthesized preview clip, not fabricated/approximated. Registered before nothing dynamic collides (static path segment). */
  @Get('voice/settings/voice-preview')
  async voicePreview(@Query('voiceId') voiceId: string) {
    const audio = await this.pollyVoice.synthesizePreview(voiceId ?? '');
    return { audioBase64: audio ? audio.toString('base64') : null };
  }

  /** Live Calls listen/take-over depth fix. */
  @RequireCapability(CAPABILITIES.VOICE_SUPERVISE)
  @Post('voice/calls/:id/listen')
  listenToCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceLiveJoin.listen(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_SUPERVISE)
  @Post('voice/calls/:id/take-over')
  takeOverCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceLiveJoin.takeOver(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_SUPERVISE)
  @Post('voice/calls/:id/supervisor/:mode')
  superviseCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mode') mode: SupervisorCoachMode,
  ) {
    return this.voiceLiveJoin.coach(user.businessId, user.sub, id, mode);
  }

  /** AI Phone, full — transfers a call that is genuinely still live to a person. */
  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/transfer')
  transferCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransferLiveCallDto,
  ) {
    return this.voiceWorkspace.transfer(user.businessId, id, dto);
  }

  /** AI Phone, full — ends a call that is genuinely still live. */
  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/end')
  endCall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.voiceWorkspace.endCall(user.businessId, id);
  }

  @Get('voice/calls/:id/notes')
  listCallNotes(@Param('id') id: string) {
    return this.voiceWorkspace.listNotes(id);
  }

  @Get('voice/calls/:id/wrap-up')
  getCallWrapUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceCallWrapUp.get(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/wrap-up')
  submitCallWrapUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitVoiceCallWrapUpDto,
  ) {
    return this.voiceCallWrapUp.submit(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/copilot-suggestion')
  suggestForLiveCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceCopilot.suggest(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/notes')
  addCallNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddCallNoteDto,
  ) {
    return this.voiceWorkspace.addNote(user.businessId, user.sub, id, dto);
  }

  /** AI Phone, full — permanently deletes a call's recording audio and transcript text; keeps the call log itself. */
  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/delete-recording')
  deleteRecording(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceWorkspace.deleteRecording(user.businessId, id);
  }

  @Get('voice/routing-rules')
  listRoutingRules(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceRoutingRules.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/routing-rules')
  createRoutingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoutingRuleDto,
  ) {
    return this.voiceRoutingRules.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/routing-rules/reorder')
  reorderRoutingRules(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderRoutingRulesDto,
  ) {
    return this.voiceRoutingRules.reorder(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/routing-rules/:id')
  updateRoutingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
  ) {
    return this.voiceRoutingRules.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/routing-rules/:id/delete')
  removeRoutingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceRoutingRules.remove(user.businessId, id);
  }

  @Get('voice/knowledge')
  listKnowledge() {
    return this.voiceKnowledge.list();
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/knowledge')
  createKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeEntryDto,
  ) {
    return this.voiceKnowledge.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Patch('voice/knowledge/:id')
  updateKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeEntryDto,
  ) {
    return this.voiceKnowledge.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/knowledge/:id/delete')
  removeKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceKnowledge.remove(user.businessId, id);
  }

  /** Call Queue (UPD-BE-129) — registered before nothing dynamic collides; every segment here is static. */
  @Get('voice/queue')
  listQueue() {
    return this.voiceQueue.list();
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/queue/clear')
  clearQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.voiceQueue.clear(user.businessId);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/queue/:id/take')
  takeQueueItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceQueue.take(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/queue/:id/offer-callback')
  offerCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceQueue.offerCallback(user.businessId, id);
  }

  @Public()
  @Post('voice/webhook/incoming')
  @HttpCode(200)
  async incoming(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; From: string; To: string };
    const xml = await this.voiceCall.handleIncoming(
      body.CallSid,
      body.From,
      body.To,
    );
    res.type('text/xml').send(xml);
  }

  @Public()
  @Post('voice/webhook/recording')
  @HttpCode(200)
  async recording(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; RecordingUrl: string };
    const ivrNodeId =
      typeof req.query.ivrNodeId === 'string' ? req.query.ivrNodeId : undefined;
    const xml = await this.voiceCall.handleRecording(
      body.CallSid,
      body.RecordingUrl,
      ivrNodeId,
    );
    res.type('text/xml').send(xml);
  }

  /** Caller choice for recording; the callback is accepted only from Twilio. */
  @Public()
  @Post('voice/webhook/recording-consent')
  @HttpCode(200)
  async recordingConsent(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; Digits?: string };
    const xml = await this.voiceCall.handleRecordingConsent(
      body.CallSid,
      body.Digits ?? '',
    );
    res.type('text/xml').send(xml);
  }

  /** Caller keypad input resumes the exact published IVR snapshot pinned to this call. */
  @Public()
  @Post('voice/webhook/ivr-input')
  @HttpCode(200)
  async ivrInput(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; Digits?: string };
    const nodeId =
      typeof req.query.nodeId === 'string' ? req.query.nodeId : undefined;
    const xml = await this.voiceCall.handleIvrInput(
      body.CallSid,
      body.Digits ?? '',
      nodeId,
    );
    res.type('text/xml').send(xml);
  }

  /** Twilio's <Dial action> callback reports whether a human actually answered. */
  @Public()
  @Post('voice/webhook/transfer-result')
  @HttpCode(200)
  async transferResult(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; DialCallStatus: string };
    const rawAttemptNumber = req.query.attemptNumber;
    const attemptNumber =
      typeof rawAttemptNumber === 'string' && /^\d+$/.test(rawAttemptNumber)
        ? Number(rawAttemptNumber)
        : undefined;
    const xml = await this.voiceCall.handleTransferResult(
      body.CallSid,
      body.DialCallStatus,
      attemptNumber,
    );
    res.type('text/xml').send(xml);
  }

  /** Capacity signal from the human callee leg; parentCallSid is bound into the signed callback URL. */
  @Public()
  @Post('voice/webhook/dial-status')
  @HttpCode(200)
  dialStatus(
    @Req() req: Request,
    @Query('parentCallSid') parentCallSid: string,
    @Query('attemptNumber') rawAttemptNumber: string | undefined,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallStatus?: string; CallSid?: string };
    const attemptNumber =
      rawAttemptNumber && /^\d+$/.test(rawAttemptNumber)
        ? Number(rawAttemptNumber)
        : undefined;
    return this.voiceCall
      .handleDialStatus(
        parentCallSid,
        body.CallStatus ?? '',
        attemptNumber,
        body.CallSid,
      )
      .then(() => ({ received: true }));
  }

  /** Records a follow-up message when a human transfer could not connect. */
  @Public()
  @Post('voice/webhook/transfer-message')
  @HttpCode(200)
  async transferMessage(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; RecordingUrl?: string };
    const xml = await this.voiceCall.handleTransferMessage(
      body.CallSid,
      body.RecordingUrl,
    );
    res.type('text/xml').send(xml);
  }

  /** Live Calls listen/take-over depth fix — both the redirected caller leg and the outbound staff leg land here. */
  @Public()
  @Post('voice/webhook/conference')
  @HttpCode(200)
  conference(
    @Req() req: Request,
    @Res() res: Response,
    @Query('conferenceName') conferenceName: string,
    @Query('muted') muted: string,
    @Query('role') role: JoinRole,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const xml = this.voiceLiveJoin.conferenceTwiml(
      conferenceName,
      muted === 'true',
      role,
    );
    res.type('text/xml').send(xml);
  }

  @Public()
  @Post('voice/webhook/status')
  @HttpCode(200)
  async status(
    @Req() req: Request,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallSid: string; CallStatus: string };
    await this.voiceCall.handleStatus(body.CallSid, body.CallStatus);
    return { received: true };
  }

  /** Power dialer: the agent answered their own phone; TwiML bridges to the customer if still allowed. */
  @Public()
  @Post('voice/webhook/outbound/agent-answered')
  @HttpCode(200)
  async outboundAgentAnswered(
    @Req() req: Request,
    @Res() res: Response,
    @Query('attemptId') attemptId: string,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const xml = await this.voiceDialer.agentAnsweredTwiml(attemptId);
    res.type('text/xml').send(xml);
  }

  @Public()
  @Post('voice/webhook/outbound/agent-status')
  @HttpCode(200)
  async outboundAgentStatus(
    @Req() req: Request,
    @Query('attemptId') attemptId: string,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as { CallStatus?: string };
    await this.voiceDialer.agentStatus(attemptId, body.CallStatus ?? '');
    return { received: true };
  }

  @Public()
  @Post('voice/webhook/outbound/customer-result')
  @HttpCode(200)
  async outboundCustomerResult(
    @Req() req: Request,
    @Res() res: Response,
    @Query('attemptId') attemptId: string,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.verifySignature(req, signature);
    const body = req.body as {
      DialCallStatus?: string;
      DialCallDuration?: string;
    };
    const xml = await this.voiceDialer.customerResult(
      attemptId,
      body.DialCallStatus ?? '',
      body.DialCallDuration ? Number(body.DialCallDuration) : undefined,
    );
    res.type('text/xml').send(xml);
  }

  private verifySignature(req: Request, signature: string | undefined) {
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!authToken) {
      throw new ServiceUnavailableException('Voice webhook is not configured');
    }
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (
      !verifyTwilioSignature(
        fullUrl,
        req.body as Record<string, string>,
        signature,
        authToken,
      )
    ) {
      throw new ForbiddenException('Invalid signature');
    }
  }
}
