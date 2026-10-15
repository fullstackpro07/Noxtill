import { createHmac, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { voiceSoftphoneIdentity } from './voice-softphone.util';

const base64Url = (value: string) => Buffer.from(value).toString('base64url');

@Injectable()
export class VoiceSoftphoneService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async status(businessId: string, userId: string) {
    const profile = await this.getProfile(businessId, userId);
    const missing = this.missingConfiguration();
    return {
      configured: missing.length === 0 && Boolean(profile),
      identity: profile ? voiceSoftphoneIdentity(businessId, profile.id) : null,
      status: !profile
        ? 'not_configured'
        : missing.length
          ? 'not_configured'
          : 'ready',
      message: !profile
        ? 'Link your account to an active voice-agent profile first.'
        : missing.length
          ? `Browser softphone is not configured. Missing: ${missing.join(', ')}.`
          : 'Twilio browser voice is configured for this agent.',
    };
  }

  async issueToken(businessId: string, userId: string) {
    const profile = await this.getProfile(businessId, userId);
    if (!profile) {
      throw new AppException(
        'VOICE_SOFTPHONE_PROFILE_REQUIRED',
        'Link your account to an active voice-agent profile before connecting the browser phone.',
        HttpStatus.CONFLICT,
      );
    }
    const missing = this.missingConfiguration();
    if (missing.length) {
      throw new AppException(
        'VOICE_SOFTPHONE_NOT_CONFIGURED',
        `Browser softphone is not configured. Missing: ${missing.join(', ')}.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID')!;
    const apiKeySid = this.config.get<string>('TWILIO_API_KEY_SID')!;
    const apiKeySecret = this.config.get<string>('TWILIO_API_KEY_SECRET')!;
    const appSid = this.config.get<string>('TWILIO_TWIML_APP_SID')!;
    const now = Math.floor(Date.now() / 1000);
    const identity = voiceSoftphoneIdentity(businessId, profile.id);
    const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
    const payload = {
      jti: `${apiKeySid}-${now}-${randomUUID()}`,
      iss: apiKeySid,
      sub: accountSid,
      iat: now,
      exp: now + 3600,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: appSid },
        },
      },
    };
    const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
    const signature = createHmac('sha256', apiKeySecret)
      .update(signingInput)
      .digest('base64url');
    const token = `${signingInput}.${signature}`;
    await this.audit.log({
      entity: 'VoiceHumanAgentProfile',
      entityId: profile.id,
      action: 'voice.softphone_token_issued',
      after: { identity, expiresInSeconds: 3600 },
    });
    return { token, identity, expiresInSeconds: 3600 };
  }

  async callForProviderSid(
    businessId: string,
    userId: string,
    providerCallSid: string,
  ) {
    const profile = await this.getProfile(businessId, userId);
    if (!profile) return null;
    const assignment =
      await this.tenantPrisma.client.voiceHumanAgentAssignment.findFirst({
        where: {
          businessId,
          profileId: profile.id,
          providerCallSid,
          status: { in: ['offered', 'connected'] },
        },
        include: {
          call: { select: { id: true, fromNumber: true, startedAt: true } },
        },
      });
    if (!assignment) return null;
    const digits = assignment.call.fromNumber.replace(/\D/g, '');
    return {
      callId: assignment.call.id,
      caller: digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••',
      providerCallSid: assignment.providerCallSid,
      conferenceSid: assignment.conferenceSid,
      status: assignment.status,
      startedAt: assignment.call.startedAt.toISOString(),
    };
  }

  async setHold(
    businessId: string,
    userId: string,
    callId: string,
    hold: boolean,
  ) {
    const assignment = await this.ownConnectedAssignment(
      businessId,
      userId,
      callId,
    );
    const holdMusicUrl = this.config.get<string>('VOICE_HOLD_MUSIC_URL');
    if (hold && (!holdMusicUrl || !/^https:\/\//i.test(holdMusicUrl))) {
      throw new AppException(
        'VOICE_HOLD_MUSIC_NOT_CONFIGURED',
        'Hold music is not configured. Set a public HTTPS VOICE_HOLD_MUSIC_URL.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const auth = this.twilioAuth();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${auth.username}/Conferences/${encodeURIComponent(assignment.conferenceSid!)}/Participants/${encodeURIComponent(assignment.call.callSid)}.json`;
    await axios.post(
      url,
      new URLSearchParams({
        Hold: hold ? 'true' : 'false',
        ...(hold ? { HoldUrl: holdMusicUrl!, HoldMethod: 'GET' } : {}),
      }),
      { auth },
    );
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: callId,
      action: hold ? 'call.held_by_agent' : 'call.resumed_by_agent',
      after: { providerConfirmed: true, actorUserId: userId },
    });
    return { callId, held: hold, providerConfirmed: true };
  }

  async hangUp(businessId: string, userId: string, callId: string) {
    const assignment = await this.ownConnectedAssignment(
      businessId,
      userId,
      callId,
    );
    const auth = this.twilioAuth();
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.username}/Calls/${encodeURIComponent(assignment.call.callSid)}.json`,
      new URLSearchParams({ Status: 'completed' }),
      { auth },
    );
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: callId,
      action: 'call.ended_by_agent_softphone',
      after: { providerConfirmed: true, actorUserId: userId },
    });
    return { callId, ending: true, providerConfirmed: true };
  }

  private async ownConnectedAssignment(
    businessId: string,
    userId: string,
    callId: string,
  ) {
    const profile = await this.getProfile(businessId, userId);
    if (!profile) {
      throw new AppException(
        'VOICE_SOFTPHONE_PROFILE_REQUIRED',
        'No active voice-agent profile is linked to this account.',
        HttpStatus.FORBIDDEN,
      );
    }
    const assignment =
      await this.tenantPrisma.client.voiceHumanAgentAssignment.findFirst({
        where: {
          businessId,
          profileId: profile.id,
          callId,
          status: 'connected',
          connected: true,
        },
        include: { call: { select: { id: true, callSid: true } } },
      });
    if (!assignment?.conferenceSid) {
      throw new AppException(
        'VOICE_SOFTPHONE_CALL_NOT_ACTIVE',
        'This call is not connected to your browser softphone.',
        HttpStatus.CONFLICT,
      );
    }
    return assignment;
  }

  private getProfile(businessId: string, userId: string) {
    return this.tenantPrisma.client.voiceHumanAgentProfile.findFirst({
      where: { businessId, active: true, staffUser: { userId, active: true } },
      select: { id: true },
    });
  }

  private missingConfiguration() {
    return [
      ['TWILIO_ACCOUNT_SID', this.config.get<string>('TWILIO_ACCOUNT_SID')],
      ['TWILIO_API_KEY_SID', this.config.get<string>('TWILIO_API_KEY_SID')],
      [
        'TWILIO_API_KEY_SECRET',
        this.config.get<string>('TWILIO_API_KEY_SECRET'),
      ],
      ['TWILIO_TWIML_APP_SID', this.config.get<string>('TWILIO_TWIML_APP_SID')],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
  }

  private twilioAuth() {
    const username = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const password = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!username || !password) {
      throw new AppException(
        'VOICE_SOFTPHONE_NOT_CONFIGURED',
        'Twilio Voice control is not configured on this server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { username, password };
  }
}
