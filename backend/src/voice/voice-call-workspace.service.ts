import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PhoneCallStatus } from '@prisma/client';
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
    if (call.legalHoldAt) {
      throw new AppException(
        VOICE_ERROR_CODES.RECORDING_LEGAL_HOLD,
        'This call is on legal hold. Release the hold before deleting its recording.',
        HttpStatus.CONFLICT,
      );
    }
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
    const erasedQualityReviews = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        // QA scores and turn-index evidence are derived from the transcript. Erase them in the same
        // transaction as the source transcript so deleting personal call content cannot leave a
        // detached evaluation behind.
        const reviews = await tx.voiceQualityReview.deleteMany({
          where: { businessId, callId: call.id },
        });
        await tx.phoneCall.update({
          where: { id: call.id },
          data: {
            recordingKey: null,
            recordingDeletedAt: new Date(),
            transcript: [],
          },
        });
        return reviews.count;
      },
    );
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.recording_deleted',
      before: { recordingKeys: keys, erasedQualityReviews },
    });
    return { id: call.id, recordingDeletedAt: new Date().toISOString() };
  }

  /** Transfers a call that is genuinely still in progress to a person — the same real Twilio "modify a live call" action `VoiceLiveJoinService` uses. */
  async transfer(
    businessId: string,
    userId: string,
    callId: string,
    dto: TransferLiveCallDto,
  ) {
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

    const primaryLine = await this.tenantPrisma.client.phoneNumber.findUnique({
      where: { businessId },
      select: { phoneNumber: true },
    });
    const trackingLine =
      !primaryLine && call.trackingNumberId
        ? await this.tenantPrisma.client.voiceTrackingNumber.findFirst({
            where: {
              id: call.trackingNumberId,
              businessId,
              active: true,
            },
            select: { phoneNumber: true },
          })
        : null;
    const callerId = primaryLine?.phoneNumber ?? trackingLine?.phoneNumber;
    if (!callerId) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'No active receptionist number is available as caller ID for this transfer',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const actionUrlBase = this.transferResultUrl();
    if (!actionUrlBase) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'A public backend URL is required to confirm whether the transfer connected',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const mode = dto.mode ?? 'cold';
    const transfer = await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM phone_calls WHERE id = ${call.id} FOR UPDATE
        `;
      const latest = await tx.voiceCallTransfer.findFirst({
        where: { businessId, callId: call.id },
        orderBy: { attemptNumber: 'desc' },
        select: { attemptNumber: true, status: true },
      });
      if (latest?.status === 'pending') {
        throw new AppException(
          'VOICE_TRANSFER_PENDING',
          'This call already has a transfer waiting for provider confirmation',
          HttpStatus.CONFLICT,
        );
      }
      return tx.voiceCallTransfer.create({
        data: {
          businessId,
          callId: call.id,
          attemptNumber: (latest?.attemptNumber ?? 0) + 1,
          mode,
          destination: toNumber,
          status: 'pending',
          requestedByUserId: userId,
        },
      });
    });

    const actionUrl = new URL(actionUrlBase);
    actionUrl.searchParams.set(
      'transferAttemptNumber',
      String(transfer.attemptNumber),
    );
    const statusUrl = this.transferWebhookUrl('transfer-status', {
      callId: call.id,
      attemptNumber: String(transfer.attemptNumber),
    });
    const screeningUrl =
      mode === 'warm'
        ? this.transferWebhookUrl('transfer-screening', {
            callId: call.id,
            attemptNumber: String(transfer.attemptNumber),
          })
        : null;
    if (!statusUrl || (mode === 'warm' && !screeningUrl)) {
      await this.tenantPrisma.client.voiceCallTransfer.update({
        where: { id: transfer.id },
        data: { status: 'failed', providerStatus: 'callback_not_configured' },
      });
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'A public backend URL is required to track the transfer with Twilio',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const auth = this.twilioAuth();
    const numberAttributes = [
      ...(screeningUrl
        ? [`url="${escapeXml(screeningUrl)}"`, 'method="POST"']
        : []),
      `statusCallback="${escapeXml(statusUrl)}"`,
      'statusCallbackMethod="POST"',
      'statusCallbackEvent="initiated ringing answered completed"',
    ].join(' ');
    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${auth.username}/Calls/${call.callSid}.json`,
        new URLSearchParams({
          Twiml: twiml(
            `<Dial action="${escapeXml(actionUrl.toString())}" method="POST" answerOnBridge="true" callerId="${escapeXml(callerId)}"><Number ${numberAttributes}>${escapeXml(toNumber)}</Number></Dial>`,
          ),
        }),
        { auth },
      );
    } catch {
      await this.tenantPrisma.client.voiceCallTransfer.update({
        where: { id: transfer.id },
        data: { status: 'failed', providerStatus: 'provider_request_failed' },
      });
      throw new AppException(
        'VOICE_TRANSFER_FAILED',
        'Twilio did not accept the transfer request',
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.tenantPrisma.client.phoneCall.update({
      where: { id: call.id },
      data: {
        routedRuleId: null,
        routedRuleName: 'Manual transfer by staff',
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.transfer_requested_by_staff',
      after: {
        transferId: transfer.id,
        attemptNumber: transfer.attemptNumber,
        toNumber,
        mode,
        status: 'pending',
      },
    });
    return {
      id: call.id,
      transferRequested: true,
      transferId: transfer.id,
      attemptNumber: transfer.attemptNumber,
      mode,
      status: 'pending' as const,
    };
  }

  async listLegs(businessId: string, callId: string) {
    const call = await this.findOwned(businessId, callId);
    const [assignments, transfers] = await Promise.all([
      this.tenantPrisma.client.voiceHumanAgentAssignment.findMany({
        where: { businessId, callId: call.id },
        include: {
          profile: {
            include: {
              staffUser: { include: { user: { select: { name: true } } } },
            },
          },
        },
        orderBy: { attemptNumber: 'asc' },
      }),
      this.tenantPrisma.client.voiceCallTransfer.findMany({
        where: { businessId, callId: call.id },
        orderBy: { attemptNumber: 'asc' },
      }),
    ]);

    return {
      callId: call.id,
      legs: [
        {
          id: call.callSid,
          role: 'caller' as const,
          label: 'Caller',
          providerCallSid: call.callSid,
          status: call.status,
          providerStatus: null,
          confirmation: 'provider-confirmed' as const,
          startedAt: call.startedAt,
        },
        ...assignments.map((assignment) => ({
          id: assignment.id,
          role: 'human-agent' as const,
          label: assignment.profile.staffUser.user.name,
          attemptNumber: assignment.attemptNumber,
          providerCallSid: assignment.providerCallSid,
          status: assignment.status,
          providerStatus: assignment.providerStatus,
          confirmation: assignment.connected
            ? ('provider-confirmed' as const)
            : assignment.status === 'released'
              ? ('failed' as const)
              : ('pending' as const),
          startedAt: assignment.createdAt,
        })),
        ...transfers.map((transfer) => ({
          id: transfer.id,
          role: 'transfer-destination' as const,
          label: transfer.destination,
          mode: transfer.mode,
          attemptNumber: transfer.attemptNumber,
          providerCallSid: transfer.providerCallSid,
          status: transfer.status,
          providerStatus: transfer.providerStatus,
          confirmation:
            transfer.status === 'provider_confirmed'
              ? ('provider-confirmed' as const)
              : transfer.status === 'failed'
                ? ('failed' as const)
                : ('pending' as const),
          startedAt: transfer.requestedAt,
        })),
      ],
    };
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

  private transferResultUrl(): string | null {
    return this.transferWebhookUrl('transfer-result');
  }

  private transferWebhookUrl(
    path: string,
    query?: Record<string, string>,
  ): string | null {
    const backendUrl = this.config
      .get<string>('BACKEND_URL')
      ?.replace(/\/+$/, '');
    if (!backendUrl) return null;
    try {
      const url = new URL(`${backendUrl}/voice/webhook/${path}`);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      for (const [key, value] of Object.entries(query ?? {})) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    } catch {
      return null;
    }
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
