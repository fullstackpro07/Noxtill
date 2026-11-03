import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, VoiceCallWrapUpDisposition } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SubmitVoiceCallWrapUpDto } from './dto/voice-call-wrap-up.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

@Injectable()
export class VoiceCallWrapUpService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(businessId: string, callId: string) {
    const call = await this.tenantPrisma.client.phoneCall.findFirst({
      where: { id: callId, businessId },
      select: { id: true },
    });
    if (!call) throw this.notFound();

    const wrapUp = await this.tenantPrisma.client.voiceCallWrapUp.findFirst({
      where: { callId, businessId },
    });
    return wrapUp ? this.serialize(wrapUp) : null;
  }

  async submit(
    businessId: string,
    actorUserId: string,
    callId: string,
    dto: SubmitVoiceCallWrapUpDto,
  ) {
    const call = await this.tenantPrisma.client.phoneCall.findFirst({
      where: { id: callId, businessId },
      select: { id: true, status: true },
    });
    if (!call) throw this.notFound();
    if (call.status === 'in_progress') {
      throw new AppException(
        VOICE_ERROR_CODES.CALL_WRAP_UP_NOT_READY,
        'After-call wrap-up is available after the provider confirms the call has ended.',
        HttpStatus.CONFLICT,
      );
    }

    const uniqueTags = new Map<string, string>();
    for (const rawTag of dto.tags ?? []) {
      const tag = rawTag.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (tag && !uniqueTags.has(tag.toLocaleLowerCase())) {
        uniqueTags.set(tag.toLocaleLowerCase(), tag);
      }
    }
    const tags = [...uniqueTags.values()];
    const wrapUp = await this.tenantPrisma.client.voiceCallWrapUp
      .create({
        data: {
          businessId,
          callId,
          disposition: dto.disposition,
          tags: tags as Prisma.InputJsonValue,
          notes: dto.notes?.trim() || null,
          completedByUserId: actorUserId,
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new AppException(
            VOICE_ERROR_CODES.CALL_WRAP_UP_ALREADY_SUBMITTED,
            'This call already has a final wrap-up.',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });
    await this.audit.log({
      entity: 'VoiceCallWrapUp',
      entityId: wrapUp.id,
      action: 'voice.call_wrap_up_submitted',
      after: {
        callId,
        disposition: dto.disposition,
        tags,
        completedByUserId: actorUserId,
      },
    });
    return this.serialize(wrapUp);
  }

  private serialize(wrapUp: {
    id: string;
    callId: string;
    disposition: VoiceCallWrapUpDisposition;
    tags: Prisma.JsonValue;
    notes: string | null;
    completedByUserId: string | null;
    createdAt: Date;
  }) {
    return {
      ...wrapUp,
      tags: Array.isArray(wrapUp.tags)
        ? wrapUp.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      createdAt: wrapUp.createdAt.toISOString(),
    };
  }

  private notFound() {
    return new AppException(
      VOICE_ERROR_CODES.CALL_WRAP_UP_NOT_FOUND,
      'Call was not found in this business.',
      HttpStatus.NOT_FOUND,
    );
  }
}
