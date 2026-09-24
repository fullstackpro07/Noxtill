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
import { escapeXml, twiml } from './twiml.util';
import { PhoneCallStatus } from '@prisma/client';

export type JoinRole = 'caller' | 'staff';

/**
 * Live Calls listen/take-over depth fix (replaces the earlier "15s-poll-only, no real audio"
 * disclosed gap) — real, live audio using standard Twilio telephony primitives, not a custom
 * WebSocket media-relay pipeline: staff's own phone rings, and once answered they're genuinely
 * bridged onto the live call via a real Twilio Conference. This is deliberately built on Twilio's
 * documented "modify a live call" REST action (redirect the in-progress caller leg into a
 * `<Dial><Conference>`) plus a second outbound `Calls` create to dial the staff member in — both
 * standard, production-grade Twilio primitives, rather than hand-rolled bidirectional audio
 * streaming (Twilio Media Streams), which would need a new WebSocket gateway and μ-law audio
 * encode/decode pipeline for a fraction of the reliability.
 *
 * "Listen" and "take over" are the SAME real mechanism, differing only in whether the staff leg
 * joins muted: listening in is joining muted (they hear everything, including the AI's own
 * `<Say>` turns, but can't be heard), taking over is joining unmuted (fully live, two-way).
 * Joining necessarily ends the AI's turn-based handling of the call — once a human is bridged on,
 * the AI stops running the `<Record>`/classify loop, which is the correct behavior for "take over"
 * and an accepted, disclosed tradeoff for "listen" (a truly silent, non-disruptive tap would need
 * the Media Streams approach above; this app doesn't have one).
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

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const auth = { username: accountSid, password: authToken };
    const conferenceName = call.callSid;

    if (!call.joinedAt) {
      // Twilio's "modify a live call" — the caller leg immediately stops whatever it was doing
      // (recording/listening to the AI) and fetches fresh TwiML putting it in the conference.
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.callSid}.json`,
        new URLSearchParams({
          Url: this.conferenceUrl(backendUrl, conferenceName, false, 'caller'),
          Method: 'POST',
        }),
        { auth },
      );
    }

    // A real outbound call to the staff member's own phone, joined into the same conference.
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

  /** Public TwiML webhook body — both the redirected caller leg and the outbound staff leg land here. */
  conferenceTwiml(
    conferenceName: string,
    muted: boolean,
    role: JoinRole,
  ): string {
    const endConferenceOnExit = role === 'caller';
    return twiml(
      `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="${endConferenceOnExit}" muted="${muted}">${escapeXml(conferenceName)}</Conference></Dial>`,
    );
  }
}
