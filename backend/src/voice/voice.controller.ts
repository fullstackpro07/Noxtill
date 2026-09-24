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
import { VoiceLiveJoinService, type JoinRole } from './voice-live-join.service';
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
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { verifyTwilioSignature } from '../common/webhooks/signature.util';

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
  ) {}

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
  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/listen')
  listenToCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceLiveJoin.listen(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/calls/:id/take-over')
  takeOverCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.voiceLiveJoin.takeOver(user.businessId, user.sub, id);
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
    const xml = await this.voiceCall.handleRecording(
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
