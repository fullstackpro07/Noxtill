import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PhoneCallStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CallTurn } from './voice-insights.service';
import { redactText } from './voice-redaction.util';
import { VOICE_ERROR_CODES } from './voice.constants';

const BATCH = 200;

type RedactableCall = {
  id: string;
  transcript: Prisma.JsonValue;
  summary: string | null;
};

/**
 * Transcripts & Recordings — personal-detail redaction of finished calls. Runs automatically when
 * the business enables `voice.redactTranscripts`, or on demand by a manager. Never touches a live
 * call or one on legal hold; the change is permanent and recorded on the call.
 */
@Injectable()
export class VoiceTranscriptRedactionService {
  private readonly logger = new Logger(VoiceTranscriptRedactionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Manual "Redact transcript" on one call. */
  async redactCall(businessId: string, callId: string) {
    const call = await this.tenantPrisma.client.phoneCall.findFirst({
      where: { id: callId, businessId },
      select: {
        id: true,
        status: true,
        legalHoldAt: true,
        transcript: true,
        summary: true,
      },
    });
    if (!call) {
      throw new AppException(
        'VOICE_CALL_NOT_FOUND',
        'Call was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (call.status === PhoneCallStatus.in_progress) {
      throw new AppException(
        VOICE_ERROR_CODES.CALL_NOT_LIVE,
        'Wait until the call has ended.',
        HttpStatus.CONFLICT,
      );
    }
    if (call.legalHoldAt) {
      throw new AppException(
        VOICE_ERROR_CODES.RECORDING_LEGAL_HOLD,
        'This call is on legal hold. Release the hold before redacting it.',
        HttpStatus.CONFLICT,
      );
    }
    // Ownership was checked above; the write is keyed by call id.
    const count = await this.apply(call);
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.transcript_redacted',
      after: { redactions: count, trigger: 'manual' },
    });
    return { id: call.id, redactions: count };
  }

  /** Background pass: finished, unprocessed, not-held calls of businesses that enabled redaction. */
  async runPending(): Promise<number> {
    const businesses = await this.prisma.business.findMany({
      where: { policies: { not: Prisma.DbNull } },
      select: { id: true, policies: true },
    });
    const enabled = businesses
      .filter((business) =>
        resolvePolicies(business).bool('voice.redactTranscripts'),
      )
      .map((business) => business.id);
    if (!enabled.length) return 0;
    const calls = await this.prisma.phoneCall.findMany({
      where: {
        businessId: { in: enabled },
        status: { not: PhoneCallStatus.in_progress },
        transcriptRedactedAt: null,
        legalHoldAt: null,
      },
      select: { id: true, businessId: true, transcript: true, summary: true },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
    });
    let processed = 0;
    for (const call of calls) {
      try {
        const count = await this.apply(call);
        await this.prisma.auditLog.create({
          data: {
            businessId: call.businessId,
            action: 'call.transcript_redacted',
            entity: 'PhoneCall',
            entityId: call.id,
            after: { redactions: count, trigger: 'policy' },
          },
        });
        processed += 1;
      } catch (error) {
        this.logger.warn(
          `Transcript redaction failed for call ${call.id}: ${(error as Error).message}`,
        );
      }
    }
    return processed;
  }

  /** Writes only if the call is still unheld and finished (guards a race with a new legal hold). */
  private async apply(call: RedactableCall): Promise<number> {
    const turns = (call.transcript as unknown as CallTurn[]) ?? [];
    let count = 0;
    const redactedTurns = turns.map((turn) => {
      const result = redactText(turn.text ?? '');
      count += result.count;
      return { ...turn, text: result.text };
    });
    const summary = call.summary ? redactText(call.summary) : null;
    count += summary?.count ?? 0;
    const updated = await this.prisma.phoneCall.updateMany({
      where: {
        id: call.id,
        legalHoldAt: null,
        status: { not: PhoneCallStatus.in_progress },
      },
      data: {
        transcript: redactedTurns as unknown as Prisma.InputJsonValue,
        summary: summary?.text ?? call.summary,
        transcriptRedactedAt: new Date(),
        transcriptRedactionCount: count,
      },
    });
    if (updated.count !== 1) {
      throw new AppException(
        VOICE_ERROR_CODES.RECORDING_LEGAL_HOLD,
        'The call changed (live or on legal hold); it was not redacted.',
        HttpStatus.CONFLICT,
      );
    }
    return count;
  }
}
