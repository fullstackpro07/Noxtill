import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { TelephonyService } from './telephony.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceQueryService } from './voice-query.service';
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
    private readonly config: ConfigService,
  ) {}

  @RequireCapability(CAPABILITIES.VOICE_MANAGE)
  @Post('voice/provision-number')
  provisionNumber(@CurrentUser() user: AuthenticatedUser) {
    return this.telephony.provisionNumber(user.businessId);
  }

  @Get('voice/calls')
  listCalls() {
    return this.voiceQuery.listCalls();
  }

  @Get('missed-calls')
  listMissedCalls() {
    return this.voiceQuery.listMissedCalls();
  }

  @Get('voice/analytics')
  analytics() {
    return this.voiceQuery.analytics();
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
