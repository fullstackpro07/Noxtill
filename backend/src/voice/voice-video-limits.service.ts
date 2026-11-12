import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { EntitlementsService } from '../usage/entitlements.service';
import { MetersService } from '../usage/meters.service';
import { METRICS, USAGE_ERROR_CODES } from '../usage/usage.constants';

/**
 * Plan limits for Video Meetings (pricing page C6): which plans include video at all, how many
 * people can be in a meeting, and the monthly participant-minute allowance. Self-hosted video is
 * the most expensive thing on the platform per hour, so these are refused before a join token is
 * minted rather than reported afterwards.
 *
 * Numbers live in `plan_entitlements` (video_minutes, video_participants) so they can be changed
 * with a row update. A plan with no number set (Enterprise: custom) is not capped here.
 */
@Injectable()
export class VoiceVideoLimitsService {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly meters: MetersService,
  ) {}

  /**
   * @param liveIdentities identities currently connected to the room (from the media provider).
   * @param identity the participant about to receive a token; a rejoin never counts twice.
   */
  async assertCanJoin(
    businessId: string,
    identity: string,
    liveIdentities: string[],
  ): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);

    const minutes = this.entitlements.includedFor(sub, METRICS.VIDEO_MINUTES);
    if (minutes === 0) {
      throw new AppException(
        USAGE_ERROR_CODES.FEATURE_NOT_IN_PLAN,
        `Video Meetings aren't included in ${sub.plan.name}. Professional and above include them.`,
        HttpStatus.FORBIDDEN,
      );
    }
    // Refuses with ALLOWANCE_EXHAUSTED (and upgrade / top-up remedies) once the month is used.
    await this.meters.assertAllowance(businessId, METRICS.VIDEO_MINUTES);

    const cap = this.entitlements.includedFor(sub, METRICS.VIDEO_PARTICIPANTS);
    if (
      cap != null &&
      !liveIdentities.includes(identity) &&
      liveIdentities.length >= cap
    ) {
      throw new AppException(
        USAGE_ERROR_CODES.CAPACITY_REACHED,
        `This meeting is full. ${sub.plan.name} allows up to ${cap} participants in a meeting.`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /** Meeting recording: never during a free trial, and within the plan's monthly recorded minutes. */
  async assertCanRecord(businessId: string): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (sub.status === 'trialing') {
      throw new AppException(
        USAGE_ERROR_CODES.TRIAL_METERED_DISABLED,
        'Meeting recording is not part of the free trial. Choose a plan to record meetings.',
        HttpStatus.FORBIDDEN,
      );
    }
    const included = this.entitlements.includedFor(
      sub,
      METRICS.VIDEO_RECORDING_MINUTES,
    );
    if (included === 0) {
      throw new AppException(
        USAGE_ERROR_CODES.FEATURE_NOT_IN_PLAN,
        `Meeting recording isn't included in ${sub.plan.name}. Professional and above include it.`,
        HttpStatus.FORBIDDEN,
      );
    }
    await this.meters.assertAllowance(
      businessId,
      METRICS.VIDEO_RECORDING_MINUTES,
    );
  }

  /** Recorded minutes from the provider-measured duration; once per recording. */
  async recordRecording(
    businessId: string,
    recordingId: string,
    durationSeconds: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!(durationSeconds > 0)) return;
    await this.meters.record(
      {
        businessId,
        metricCode: METRICS.VIDEO_RECORDING_MINUTES,
        quantity: Math.round((durationSeconds / 60) * 100) / 100,
        unit: 'minute',
        provider: 'livekit',
        providerRef: recordingId,
        idempotencyKey: `livekit:recording:${recordingId}`,
        metadata: { recordingId },
      },
      tx,
    );
  }
}
