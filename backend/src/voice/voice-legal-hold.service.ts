import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { VOICE_ERROR_CODES } from './voice.constants';

/**
 * Legal hold for call recordings/transcripts. While a hold is set, manual deletion is refused and
 * the retention purge skips the call. Placing and releasing are audited with the reason.
 */
@Injectable()
export class VoiceLegalHoldService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async place(
    businessId: string,
    actorUserId: string,
    callId: string,
    reason: string,
  ) {
    const call = await this.find(businessId, callId);
    if (call.legalHoldAt) {
      throw this.conflict('This call is already on legal hold.');
    }
    const legalHoldAt = new Date();
    await this.tenantPrisma.client.phoneCall.update({
      where: { id: call.id },
      data: {
        legalHoldAt,
        legalHoldByUserId: actorUserId,
        legalHoldReason: reason.trim(),
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.legal_hold_placed',
      after: { reason: reason.trim(), actorUserId },
    });
    return { id: call.id, legalHoldAt: legalHoldAt.toISOString() };
  }

  async release(
    businessId: string,
    actorUserId: string,
    callId: string,
    reason: string,
  ) {
    const call = await this.find(businessId, callId);
    if (!call.legalHoldAt)
      throw this.conflict('This call is not on legal hold.');
    await this.tenantPrisma.client.phoneCall.update({
      where: { id: call.id },
      data: {
        legalHoldAt: null,
        legalHoldByUserId: null,
        legalHoldReason: null,
      },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.legal_hold_released',
      before: { heldAt: call.legalHoldAt, reason: call.legalHoldReason },
      after: { reason: reason.trim(), actorUserId },
    });
    return { id: call.id, legalHoldAt: null };
  }

  private async find(businessId: string, callId: string) {
    const call = await this.tenantPrisma.client.phoneCall.findFirst({
      where: { id: callId, businessId },
      select: { id: true, legalHoldAt: true, legalHoldReason: true },
    });
    if (!call) {
      throw new AppException(
        'VOICE_CALL_NOT_FOUND',
        'Call was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return call;
  }

  private conflict(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.RECORDING_LEGAL_HOLD,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
