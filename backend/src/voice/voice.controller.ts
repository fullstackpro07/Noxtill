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
import { PollyVoiceService } from './polly-voice.service';
import { UpdateVoiceSettingsDto } from './dto/update-voice-settings.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { verifyTwilioSignature } from '../common/webhooks/signature.util';

@Controller()
export class VoiceController {
  constructor(
    private readonly telephony: TelephonyService,
    private readonly voiceCall: VoiceCallService,
    private readonly voiceQuery: VoiceQueryService,
    private readonly voiceSettings: VoiceSettingsService,
    private readonly voiceQueue: VoiceQueueService,
    private readonly voiceLiveJoin: VoiceLiveJoinService,
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
