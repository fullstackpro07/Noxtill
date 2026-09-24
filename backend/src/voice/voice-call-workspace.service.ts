import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { S3Service } from '../common/storage/s3.service';
import { escapeXml, twiml } from './twiml.util';
import { VOICE_ERROR_CODES } from './voice.constants';
import {
  AddCallNoteDto,
  TransferLiveCallDto,
} from './dto/call-workspace-actions.dto';

interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
  recordingKey?: string;
}

/**
 * AI Phone, full — the real actions the call workspace's action bar takes on a call: an internal
 * note, deleting a recording, and (for a LIVE call) transferring it to a person or ending it.
 * Transfer/end reuse the exact same Twilio "modify a live call" REST primitive as
 * `VoiceLiveJoinService`'s listen/take-over — no new telephony mechanism.
 */
@Injectable()
export class VoiceCallWorkspaceService {
  private readonly logger = new Logger(VoiceCallWorkspaceService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly s3: S3Service,
  ) {}

  async addNote(
    businessId: string,
    userId: string,
    callId: string,
    dto: AddCallNoteDto,
  ) {
    const call = await this.findOwned(businessId, callId);
    const note = await this.tenantPrisma.client.phoneCallNote.create({
      data: {
        businessId,
        callId: call.id,
        authorUserId: userId,
        body: dto.body.trim(),
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.note_added',
      after: { noteId: note.id },
    });
    return note;
  }

  listNotes(callId: string) {
    return this.tenantPrisma.client.phoneCallNote.findMany({
      where: { callId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Deletes the recording audio (every turn's S3 copy) AND the transcript text, but keeps the call log entry, its outcome, any summary and any linked booking/order. Irreversible. */
  async deleteRecording(businessId: string, callId: string) {
    const call = await this.findOwned(businessId, callId);
    const turns = (call.transcript as unknown as CallTurn[]) ?? [];
    const keys = [
      ...new Set(
        [call.recordingKey, ...turns.map((t) => t.recordingKey)].filter(
          (k): k is string => !!k,
        ),
      ),
    ];
    for (const key of keys) {
      try {
        await this.s3.delete(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete recording ${key} for call ${call.callSid}: ${(error as Error).message}`,
        );
      }
    }
    // The audio AND the words are removed — what the caller said is personal data. The call log entry,
    // its outcome, any summary and any linked booking stay (the summary was written from the transcript
    // when someone asked for one; it is not regenerated).
    await this.tenantPrisma.client.phoneCall.update({
      where: { id: call.id },
      data: {
        recordingKey: null,
        recordingDeletedAt: new Date(),
        transcript: [],
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.recording_deleted',
      before: { recordingKeys: keys },
    });
    return { id: call.id, recordingDeletedAt: new Date().toISOString() };
  }

  /** Transfers a call that is genuinely still in progress to a person — the same real Twilio "modify a live call" action `VoiceLiveJoinService` uses. */
  async transfer(businessId: string, callId: string, dto: TransferLiveCallDto) {
    const call = await this.findOwned(businessId, callId);
    this.assertLive(call.status);

    const settings = await this.tenantPrisma.client.voiceSettings.findUnique({
      where: { businessId },
    });
    const toNumber =
      dto.toNumber ||
      settings?.transferNumber ||
      this.config.get<string>('VOICE_TRANSFER_NUMBER');
    if (!toNumber) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'No transfer number is configured — set one in Settings or give one for this call',
        HttpStatus.BAD_REQUEST,
      );
    }

    const auth = this.twilioAuth();
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.username}/Calls/${call.callSid}.json`,
      new URLSearchParams({
        Twiml: twiml(`<Dial>${escapeXml(toNumber)}</Dial>`),
      }),
      { auth },
    );

    await this.tenantPrisma.client.phoneCall.update({
      where: { id: call.id },
      data: {
        outcome: PhoneCallOutcome.transfer,
        routedRuleId: null,
        routedRuleName: 'Manual transfer by staff',
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.transferred_by_staff',
      after: { toNumber },
    });
    return { id: call.id, outcome: 'transfer' as const };
  }

  /** Ends a call that is genuinely still in progress — a real Twilio "modify a live call" status change, not a local-only flag. */
  async endCall(businessId: string, callId: string) {
    const call = await this.findOwned(businessId, callId);
    this.assertLive(call.status);

    const auth = this.twilioAuth();
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.username}/Calls/${call.callSid}.json`,
      new URLSearchParams({ Status: 'completed' }),
      { auth },
    );
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.ended_by_staff',
    });
    // The definitive status/duration comes from Twilio's own status callback a moment later
    // (`VoiceCallService.handleStatus`) — this call just asks Twilio to end it now.
    return { id: call.id, ending: true };
  }

  private assertLive(status: PhoneCallStatus) {
    if (status !== PhoneCallStatus.in_progress) {
      throw new AppException(
        VOICE_ERROR_CODES.CALL_NOT_LIVE,
        'This call is no longer in progress',
        HttpStatus.CONFLICT,
      );
    }
  }

  private twilioAuth() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { username: accountSid, password: authToken };
  }

  private async findOwned(businessId: string, callId: string) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id: callId },
    });
    if (!call || call.businessId !== businessId) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }
}
