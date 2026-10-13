import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelephonyService } from './telephony.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceQueryService } from './voice-query.service';
import { VoiceInsightsService } from './voice-insights.service';
import { VoiceSettingsService } from './voice-settings.service';
import { VoiceQueueService } from './voice-queue.service';
import { VoiceLiveJoinService } from './voice-live-join.service';
import { VoiceCallWorkspaceService } from './voice-call-workspace.service';
import { VoiceAgentsService } from './voice-agents.service';
import { VoiceAiAgentsService } from './voice-ai-agents.service';
import { VoiceCallWrapUpService } from './voice-call-wrap-up.service';
import { VoiceCopilotService } from './voice-copilot.service';
import { VoiceQualityService } from './voice-quality.service';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceMeetingsService } from './voice-meetings.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';
import { VoiceOutboundDialerService } from './voice-outbound-dialer.service';
import { VoiceRoutingRulesService } from './voice-routing-rules.service';
import { VoiceIvrService } from './voice-ivr.service';
import { VoiceSupervisorService } from './voice-supervisor.service';
import { VoiceTrackingService } from './voice-tracking.service';
import { VoiceTrackingNumbersService } from './voice-tracking-numbers.service';
import { VoiceCallbacksService } from './voice-callbacks.service';
import { VoiceLegalHoldService } from './voice-legal-hold.service';
import { VoiceAnalyticsExportService } from './voice-analytics-export.service';
import { VoiceKnowledgeService } from './voice-knowledge.service';
import { PollyVoiceService } from './polly-voice.service';
import { MissedCallService } from './missed-call.service';
import { VoiceHumanAgentDispatchService } from './voice-human-agent-dispatch.service';
import { VoiceController } from './voice.controller';
import { VoiceRetentionScheduler } from './jobs/voice-retention.scheduler';
import { VoiceRetentionProcessor } from './jobs/voice-retention.processor';
import { VoiceProviderCostScheduler } from './jobs/voice-provider-cost.scheduler';
import { VoiceProviderCostProcessor } from './jobs/voice-provider-cost.processor';
import {
  VOICE_PROVIDER_COST_QUEUE,
  VOICE_RETENTION_QUEUE,
} from './voice.constants';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../common/storage/storage.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: VOICE_RETENTION_QUEUE },
      { name: VOICE_PROVIDER_COST_QUEUE },
    ),
    AiModule,
    StorageModule,
    BookingsModule,
    MessagingModule,
  ],
  controllers: [VoiceController],
  providers: [
    TelephonyService,
    VoiceCallService,
    VoiceQueryService,
    VoiceInsightsService,
    VoiceSettingsService,
    VoiceQueueService,
    VoiceLiveJoinService,
    VoiceCallWorkspaceService,
    VoiceAgentsService,
    VoiceAiAgentsService,
    VoiceCallWrapUpService,
    VoiceCopilotService,
    VoiceQualityService,
    VoiceComplianceService,
    VoiceMeetingsService,
    VoiceOutboundCampaignService,
    VoiceOutboundDialerService,
    VoiceIvrService,
    VoiceSupervisorService,
    VoiceTrackingService,
    VoiceTrackingNumbersService,
    VoiceCallbacksService,
    VoiceLegalHoldService,
    VoiceAnalyticsExportService,
    VoiceRoutingRulesService,
    VoiceKnowledgeService,
    PollyVoiceService,
    MissedCallService,
    VoiceHumanAgentDispatchService,
    VoiceRetentionScheduler,
    VoiceRetentionProcessor,
    VoiceProviderCostScheduler,
    VoiceProviderCostProcessor,
  ],
})
export class VoiceModule {}
