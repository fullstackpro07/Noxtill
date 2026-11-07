import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { VOICE_ERROR_CODES } from './voice.constants';
import { conferenceUsageAttributes, escapeXml, twiml } from './twiml.util';
import { PhoneCallStatus } from '@prisma/client';

export type JoinRole = 'caller' | 'staff';
export type SupervisorCoachMode = 'listen' | 'whisper' | 'barge';

/**
 * Live Calls listen/take-over depth fix (replaces the earlier "15s-poll-only, no real audio"
 * disclosed gap) — real, live audio using standard Twilio telephony primitives, not a custom
 * WebSocket media-relay pipeline: staff's own phone rings, and once answered they're genuinely
 * bridged onto the live call via a real Twilio Conference. This is deliberately built on Twilio's
 * documented "modify a live call" REST action (redirect the in-progress caller leg into a
 * `<Dial><Conference>`) plus a second outbound `Calls` create to dial the staff member in — both
 * standard Twilio primitives. The separate AI realtime gateway uses bidirectional Media Streams;
 * it is not a second controller for this human conference.
 *
 * "Listen" and "take over" are the SAME real mechanism, differing only in whether the staff leg
 * joins muted: listening in is joining muted (they hear everything, including the AI's own
 * `<Say>` turns, but can't be heard), taking over is joining unmuted (fully live, two-way).
 * Joining necessarily ends the AI's turn-based handling of the call — once a human is bridged on,
 * the AI stops running the `<Record>`/classify loop, which is the correct behavior for "take over"
 * and a disclosed tradeoff for the legacy "listen" redirect. This path is not advertised as a
 * non-disruptive tap on an active AI realtime stream.
 */
@Injectable()
export class VoiceLiveJoinService {
  private readonly logger = new Logger(VoiceLiveJoinService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  listen(businessId: string, userId: string, callId: string) {
    return this.join(businessId, userId, callId, true);
  }

  takeOver(businessId: string, userId: string, callId: string) {
    return this.join(businessId, userId, callId, false);
  }

  async coach(
    businessId: string,
    userId: string,
    callId: string,
    mode: SupervisorCoachMode,
  ) {
    if (!['listen', 'whisper', 'barge'].includes(mode)) {
      throw new AppException(
        VOICE_ERROR_CODES.SUPERVISOR_COACHING_UNAVAILABLE,
        'Choose listen, whisper or barge',
        HttpStatus.BAD_REQUEST,
      );
    }
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id: callId },
    });
    if (!call || call.businessId !== businessId) {
      throw new NotFoundException('Call not found');
    }
    if (call.status !== PhoneCallStatus.in_progress) {
      throw new AppException(
        VOICE_ERROR_CODES.CALL_NOT_LIVE,
        'This call is no longer in progress',
        HttpStatus.CONFLICT,
      );
    }
    const assignment =
      await this.tenantPrisma.client.voiceHumanAgentAssignment.findFirst({
        where: {
          businessId,
          callId,
          status: 'connected',
          connected: true,
          providerCallSid: { not: null },
          conferenceSid: { not: null },
        },
        orderBy: { attemptNumber: 'desc' },
        select: { providerCallSid: true, conferenceSid: true },
      });
    if (!assignment?.providerCallSid || !assignment.conferenceSid) {
      throw new AppException(
        VOICE_ERROR_CODES.SUPERVISOR_COACHING_UNAVAILABLE,
        'Whisper and barge require an internal agent connected to a shared Twilio conference',
        HttpStatus.CONFLICT,
      );
    }
    const user = await this.tenantPrisma.client.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user?.phone) {
      throw new AppException(
        VOICE_ERROR_CODES.NO_STAFF_PHONE,
        'Add a phone number to your account before joining a live call',
        HttpStatus.BAD_REQUEST,
      );
    }
    const phoneNumber = await this.tenantPrisma.client.phoneNumber.findUnique({
      where: { businessId },
      select: { phoneNumber: true },
    });
    if (!phoneNumber) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'No receptionist number provisioned for this business',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const { accountSid, authToken } = this.getProviderCredentials();
    await this.upsertParticipant({
      accountSid,
      authToken,
      conferenceSid: assignment.conferenceSid,
      label: `supervisor-${userId}`,
      to: user.phone,
      from: phoneNumber.phoneNumber,
      muted: mode === 'listen',
      coaching: mode === 'whisper',
      ...(mode === 'whisper'
        ? { callSidToCoach: assignment.providerCallSid }
        : {}),
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: callId,
      action: `call.supervisor_${mode}`,
    });
    return { callId, mode, accepted: true };
  }

  private async join(
    businessId: string,
    userId: string,
    callId: string,
    muted: boolean,
  ) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id: callId },
    });
    if (!call || call.businessId !== businessId) {
      throw new NotFoundException('Call not found');
    }
    if (call.status !== PhoneCallStatus.in_progress) {
      throw new AppException(
        VOICE_ERROR_CODES.CALL_NOT_LIVE,
        'This call is no longer in progress',
        HttpStatus.CONFLICT,
      );
    }

    const user = await this.tenantPrisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user?.phone) {
      throw new AppException(
        VOICE_ERROR_CODES.NO_STAFF_PHONE,
        'Add a phone number to your account before joining a live call',
        HttpStatus.BAD_REQUEST,
      );
    }

    const phoneNumber = await this.tenantPrisma.client.phoneNumber.findUnique({
      where: { businessId },
    });
    if (!phoneNumber) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'No receptionist number provisioned for this business',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const { accountSid, authToken } = this.getProviderCredentials();

    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const auth = { username: accountSid, password: authToken };
    const conferenceName = call.callSid;
    const activeAgent =
      await this.tenantPrisma.client.voiceHumanAgentAssignment.findFirst({
        where: {
          businessId,
          callId,
          status: 'connected',
          connected: true,
          providerCallSid: { not: null },
          conferenceSid: { not: null },
        },
        orderBy: { attemptNumber: 'desc' },
        select: { conferenceSid: true },
      });

    if (activeAgent?.conferenceSid) {
      await this.upsertParticipant({
        accountSid,
        authToken,
        conferenceSid: activeAgent.conferenceSid,
        label: `supervisor-${userId}`,
        to: user.phone,
        from: phoneNumber.phoneNumber,
        muted,
        coaching: false,
      });
    } else {
      if (!call.joinedAt) {
        // The caller leg moves into a conference with the supervisor when no human transfer exists.
        await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.callSid}.json`,
          new URLSearchParams({
            Url: this.conferenceUrl(
              backendUrl,
              conferenceName,
              false,
              'caller',
            ),
            Method: 'POST',
          }),
          { auth },
        );
      }

      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        new URLSearchParams({
          To: user.phone,
          From: phoneNumber.phoneNumber,
          Url: this.conferenceUrl(backendUrl, conferenceName, muted, 'staff'),
          Method: 'POST',
        }),
        { auth },
      );
    }

    this.logger.log(
      `${muted ? 'Listen' : 'Take-over'} join for call ${call.callSid} by user ${userId}`,
    );

    const updated = await this.tenantPrisma.client.phoneCall.update({
      where: { id: callId },
      data: { joinedAt: call.joinedAt ?? new Date(), joinedByUserId: userId },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: callId,
      action: muted ? 'call.listened_in' : 'call.taken_over',
    });
    return updated;
  }

  private conferenceUrl(
    backendUrl: string,
    conferenceName: string,
    muted: boolean,
    role: JoinRole,
  ): string {
    const params = new URLSearchParams({
      conferenceName,
      muted: String(muted),
      role,
    });
    return `${backendUrl}/voice/webhook/conference?${params.toString()}`;
  }

  private getProviderCredentials() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { accountSid, authToken };
  }

  private participantsUrl(accountSid: string, conferenceSid: string) {
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Conferences/${conferenceSid}/Participants`;
  }

  private isProviderNotFound(error: unknown) {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
      return false;
    }
    const response = (error as { response?: { status?: number } }).response;
    return response?.status === 404;
  }

  private async upsertParticipant(input: {
    accountSid: string;
    authToken: string;
    conferenceSid: string;
    label: string;
    to: string;
    from: string;
    muted: boolean;
    coaching: boolean;
    callSidToCoach?: string;
  }) {
    const baseUrl = this.participantsUrl(input.accountSid, input.conferenceSid);
    const participantUrl = `${baseUrl}/${encodeURIComponent(input.label)}.json`;
    const auth = { username: input.accountSid, password: input.authToken };
    const updateData = new URLSearchParams({
      Muted: String(input.muted),
      Coaching: String(input.coaching),
      ...(input.coaching && input.callSidToCoach
        ? { CallSidToCoach: input.callSidToCoach }
        : {}),
    });

    let exists = true;
    try {
      await axios.get(participantUrl, { auth });
    } catch (error) {
      if (this.isProviderNotFound(error)) {
        exists = false;
      } else {
        throw new AppException(
          VOICE_ERROR_CODES.CONFERENCE_PARTICIPANT_FAILED,
          'Twilio could not inspect the supervisor conference connection',
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    try {
      if (exists) {
        await axios.post(participantUrl, updateData, { auth });
      } else {
        await axios.post(
          `${baseUrl}.json`,
          new URLSearchParams({
            To: input.to,
            From: input.from,
            Label: input.label,
            Muted: String(input.muted),
            Coaching: String(input.coaching),
            StartConferenceOnEnter: 'true',
            EndConferenceOnExit: 'false',
            Beep: 'false',
            ...(input.coaching && input.callSidToCoach
              ? { CallSidToCoach: input.callSidToCoach }
              : {}),
          }),
          { auth },
        );
      }
    } catch {
      throw new AppException(
        VOICE_ERROR_CODES.CONFERENCE_PARTICIPANT_FAILED,
        'Twilio could not update the supervisor conference connection',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Public TwiML webhook body — both the redirected caller leg and the outbound staff leg land here. */
  conferenceTwiml(
    conferenceName: string,
    muted: boolean,
    role: JoinRole,
  ): string {
    const endConferenceOnExit = role === 'caller';
    return twiml(
      `<Dial><Conference${conferenceUsageAttributes(this.config.get<string>('BACKEND_URL'))} startConferenceOnEnter="true" endConferenceOnExit="${endConferenceOnExit}" muted="${muted}">${escapeXml(conferenceName)}</Conference></Dial>`,
    );
  }
}
