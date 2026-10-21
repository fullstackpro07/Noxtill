import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoiceVideoMeetingStatus } from '@prisma/client';
import { VoiceVideoRoomService } from './voice-video-room.service';
import {
  findValidMeetingInvite,
  liveKitVideoConfig,
} from './voice-meeting-access.util';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { EmailService } from '../messaging/channels/email.service';
import {
  CreateVoiceMeetingDto,
  CreateVoiceMeetingInviteDto,
  RescheduleVoiceMeetingDto,
  VoiceMeetingReasonDto,
} from './dto/voice-meeting.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

const hashInvite = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** `sent` only after the email provider accepted the message; otherwise the organizer shares the link. */
export type VoiceMeetingInviteEmailDelivery =
  'sent' | 'failed' | 'not_configured';

@Injectable()
export class VoiceMeetingsService {
  private readonly logger = new Logger(VoiceMeetingsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly videoRooms: VoiceVideoRoomService,
  ) {}

  async listHosts(businessId: string) {
    const hosts = await this.tenantPrisma.client.businessUser.findMany({
      where: { businessId, active: true },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
    });
    return hosts.map((host) => ({
      id: host.id,
      name: host.user.name,
      email: host.user.email,
    }));
  }

  configuration() {
    return {
      mediaConfigured: Boolean(this.liveKitConfig()),
      screenSharing: 'host_only' as const,
      recording: this.videoRooms.recordingConfigured()
        ? ('configured' as const)
        : ('not_configured' as const),
      chat: 'not_available' as const,
    };
  }

  async list(businessId: string) {
    const meetings = await this.tenantPrisma.client.voiceVideoMeeting.findMany({
      where: { businessId },
      include: {
        host: { include: { user: { select: { id: true, name: true } } } },
        customer: { select: { id: true, name: true } },
        appointment: { select: { id: true, bookingNo: true, status: true } },
        _count: { select: { invites: { where: { revokedAt: null } } } },
        recordings: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { status: true, retentionExpiresAt: true, finalizedAt: true, sizeBytes: true },
        },
        invites: {
          where: { revokedAt: null },
          select: {
            id: true,
            email: true,
            guestName: true,
            expiresAt: true,
            emailSentAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt.toISOString(),
      durationMin: meeting.durationMin,
      timeZone: meeting.timeZone,
      status: meeting.status,
      roomState: meeting.roomState,
      host: {
        id: meeting.host.id,
        name: meeting.host.user.name,
      },
      customer: meeting.customer,
      appointment: meeting.appointment,
      inviteCount: meeting._count.invites,
      invites: meeting.invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        guestName: invite.guestName,
        expiresAt: invite.expiresAt.toISOString(),
        emailSentAt: invite.emailSentAt?.toISOString() ?? null,
      })),
      media: this.liveKitConfig()
        ? ('configured' as const)
        : ('not_configured' as const),
      recording: meeting.recordings[0]?.status ?? 'not_started',
      recordingExpiresAt: meeting.recordings[0]?.retentionExpiresAt.toISOString() ?? null,
      recordingFinalizedAt: meeting.recordings[0]?.finalizedAt?.toISOString() ?? null,
      recordingSizeBytes: meeting.recordings[0]?.sizeBytes?.toString() ?? null,
    }));
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceMeetingDto,
  ) {
    const scheduledAt = this.validateSchedule(dto.scheduledAt, dto.durationMin);
    this.validateTimeZone(dto.timeZone);
    const host = await this.tenantPrisma.client.businessUser.findFirst({
      where: { id: dto.hostBusinessUserId, businessId, active: true },
      select: { id: true },
    });
    if (!host) {
      throw new AppException(
        VOICE_ERROR_CODES.MEETING_HOST_NOT_FOUND,
        'Select an active host in this business.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const recordingPolicyVersionId = dto.recordingPolicyVersionId || null;
    if (recordingPolicyVersionId) {
      const policy = await this.tenantPrisma.client.voiceCompliancePolicyVersion.findFirst({
        where: {
          id: recordingPolicyVersionId,
          businessId,
          status: 'published',
          recordingAllowed: true,
          recordingNoticeText: { not: null },
          recordingRetentionDays: { not: null },
          pack: { businessId, disabledAt: null },
        },
        select: { id: true },
      });
      if (!policy) throw this.invalid('Choose an active published recording policy that permits recording and defines retention.');
    }

    let customerId = dto.customerId || null;
    if (dto.appointmentId) {
      const appointment = await this.tenantPrisma.client.appointment.findFirst({
        where: { id: dto.appointmentId, businessId },
        select: { id: true, customerId: true },
      });
      if (!appointment) throw this.invalid('The linked booking was not found.');
      if (customerId && customerId !== appointment.customerId) {
        throw this.invalid(
          'The selected customer does not match the linked booking.',
        );
      }
      customerId = appointment.customerId;
    } else if (customerId) {
      const customer = await this.tenantPrisma.client.customer.findFirst({
        where: { id: customerId, businessId },
        select: { id: true },
      });
      if (!customer) throw this.invalid('The selected customer was not found.');
    }

    const meeting = await this.tenantPrisma.client.voiceVideoMeeting.create({
      data: {
        businessId,
        title: dto.title.trim(),
        scheduledAt,
        durationMin: dto.durationMin,
        timeZone: dto.timeZone.trim(),
        hostBusinessUserId: host.id,
        customerId,
        appointmentId: dto.appointmentId || null,
        recordingPolicyVersionId,
        createdByUserId: actorUserId,
      },
    });
    await this.audit.log({
      entity: 'VoiceVideoMeeting',
      entityId: meeting.id,
      action: 'voice.meeting.created',
      after: {
        title: meeting.title,
        scheduledAt: meeting.scheduledAt,
        durationMin: meeting.durationMin,
        hostBusinessUserId: meeting.hostBusinessUserId,
        customerId: meeting.customerId,
        appointmentId: meeting.appointmentId,
      },
    });
    return meeting;
  }

  async reschedule(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    dto: RescheduleVoiceMeetingDto,
  ) {
    const meeting = await this.findMeeting(businessId, meetingId);
    if (
      meeting.status !== VoiceVideoMeetingStatus.scheduled ||
      meeting.roomState !== 'not_started' ||
      meeting.endRequestedAt
    ) {
      throw this.invalid('Only a scheduled meeting can be rescheduled.');
    }
    const scheduledAt = this.validateSchedule(dto.scheduledAt, dto.durationMin);
    const updated = await this.tenantPrisma.client.voiceVideoMeeting.update({
      where: { id: meeting.id },
      data: { scheduledAt, durationMin: dto.durationMin },
    });
    await this.audit.log({
      entity: 'VoiceVideoMeeting',
      entityId: meeting.id,
      action: 'voice.meeting.rescheduled',
      before: {
        scheduledAt: meeting.scheduledAt,
        durationMin: meeting.durationMin,
      },
      after: {
        scheduledAt: updated.scheduledAt,
        durationMin: updated.durationMin,
        actorUserId,
      },
    });
    return updated;
  }

  async cancel(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    dto: VoiceMeetingReasonDto,
  ) {
    const meeting = await this.findMeeting(businessId, meetingId);
    if (meeting.status !== VoiceVideoMeetingStatus.scheduled) {
      throw this.invalid('Only a scheduled meeting can be canceled.');
    }
    const now = new Date();
    const updated = await this.tenantPrisma.client.voiceVideoMeeting.update({
      where: { id: meeting.id },
      data: {
        status: VoiceVideoMeetingStatus.cancelled,
        cancelledAt: now,
        cancellationReason: dto.reason.trim(),
        roomState: 'ending',
        endRequestedAt: now,
      },
    });
    await this.tenantPrisma.client.voiceMeetingInvite.updateMany({
      where: { meetingId, businessId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.audit.log({
      entity: 'VoiceVideoMeeting',
      entityId: meeting.id,
      action: 'voice.meeting.cancelled',
      after: { reason: dto.reason.trim(), actorUserId },
    });
    // Idempotent provider lookup/delete; lack of provider confirmation stays visible as ending.
    await this.videoRooms.reconcileClosures(businessId, meeting.id);
    return updated;
  }

  async createInvite(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    dto: CreateVoiceMeetingInviteDto,
  ) {
    const meeting = await this.findMeeting(businessId, meetingId);
    const now = new Date();
    if (
      meeting.status !== VoiceVideoMeetingStatus.scheduled ||
      meeting.scheduledAt.getTime() <= now.getTime()
    ) {
      throw this.invalid(
        'Guest links can only be created for a future scheduled meeting.',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      meeting.scheduledAt.getTime() +
        meeting.durationMin * 60_000 +
        60 * 60_000,
    );
    const invite = await this.tenantPrisma.client.voiceMeetingInvite.create({
      data: {
        businessId,
        meetingId,
        email: dto.email.trim().toLowerCase(),
        guestName: dto.guestName?.trim() || null,
        tokenHash: hashInvite(token),
        expiresAt,
        createdByUserId: actorUserId,
      },
    });
    const sharePath = `/meeting/${token}`;
    const emailDelivery = await this.emailInvite(
      businessId,
      meeting,
      invite.id,
      invite.email,
      invite.guestName,
      sharePath,
      expiresAt,
    );
    await this.audit.log({
      entity: 'VoiceMeetingInvite',
      entityId: invite.id,
      action: 'voice.meeting.invite_created',
      after: {
        meetingId,
        emailDomain: dto.email.split('@').pop()?.toLowerCase() ?? null,
        expiresAt,
        tokenReturnedOnce: true,
        emailDelivery,
      },
    });
    return {
      id: invite.id,
      token,
      sharePath,
      expiresAt: expiresAt.toISOString(),
      emailDelivery,
    };
  }

  /**
   * Emails the guest link through the shared EmailService. A provider failure never fails the
   * invite itself — the organizer still gets the one-time link to share manually.
   */
  private async emailInvite(
    businessId: string,
    meeting: {
      title: string;
      scheduledAt: Date;
      durationMin: number;
      timeZone: string;
    },
    inviteId: string,
    to: string,
    guestName: string | null,
    sharePath: string,
    expiresAt: Date,
  ): Promise<VoiceMeetingInviteEmailDelivery> {
    if (
      !this.config.get<string>('EMAIL_PROVIDER_KEY') ||
      !this.config.get<string>('EMAIL_FROM_ADDRESS')
    ) {
      return 'not_configured';
    }
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });
    const frontendUrl = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    const format = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: meeting.timeZone,
    });
    const when = `${format.format(meeting.scheduledAt)} (${meeting.timeZone})`;
    try {
      const result = await this.email.send({
        to,
        templateKey: 'video_meeting_invite',
        text: [
          `Hi ${guestName ?? 'there'},`,
          `${business?.name ?? 'A business'} invited you to "${meeting.title}" on ${when} (${meeting.durationMin} minutes).`,
          `Meeting details: ${frontendUrl}${sharePath}`,
          `This link is personal to you and expires on ${format.format(expiresAt)} (${meeting.timeZone}).`,
        ].join('\n\n'),
        locale: 'en',
        businessId,
      });
      await this.tenantPrisma.client.voiceMeetingInvite.update({
        where: { id: inviteId },
        data: { emailSentAt: new Date(), emailProviderRef: result.providerRef },
      });
      return 'sent';
    } catch {
      this.logger.warn(
        `Meeting invite email delivery failed for invite ${inviteId}`,
      );
      return 'failed';
    }
  }

  async revokeInvite(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    inviteId: string,
    dto: VoiceMeetingReasonDto,
  ) {
    const invite = await this.tenantPrisma.client.voiceMeetingInvite.findFirst({
      where: { id: inviteId, meetingId, businessId, revokedAt: null },
    });
    if (!invite) throw this.inviteNotFound();
    const revokedAt = new Date();
    await this.tenantPrisma.client.voiceMeetingInvite.update({
      where: { id: invite.id },
      data: { revokedAt },
    });
    await this.videoRooms.revokeInviteParticipant(
      businessId,
      actorUserId,
      invite.id,
    );
    await this.audit.log({
      entity: 'VoiceMeetingInvite',
      entityId: invite.id,
      action: 'voice.meeting.invite_revoked',
      after: { reason: dto.reason.trim(), actorUserId },
    });
    return { id: invite.id, revokedAt: revokedAt.toISOString() };
  }

  async previewInvite(token: string) {
    const invite = await this.findValidInvite(token);
    const mediaAvailable = Boolean(this.liveKitConfig());
    return {
      title: invite.meeting.title,
      businessName: invite.meeting.business.name,
      scheduledAt: invite.meeting.scheduledAt.toISOString(),
      durationMin: invite.meeting.durationMin,
      timeZone: invite.meeting.timeZone,
      expiresAt: invite.expiresAt.toISOString(),
      mediaAvailable,
      message: mediaAvailable
        ? 'Live video is available. Request admission using this personal invitation. Only the host can screen share. If recording is enabled, read and accept its published notice before joining.'
        : 'This invite is valid for meeting details, but live video is not configured on this server yet.',
    };
  }

  async hostJoinToken(
    businessId: string,
    actorUserId: string,
    meetingId: string,
  ) {
    return this.videoRooms.hostJoinToken(businessId, actorUserId, meetingId);
  }

  async guestJoinToken(token: string) {
    return this.videoRooms.guestJoinToken(token);
  }

  private async findMeeting(businessId: string, meetingId: string) {
    const meeting = await this.tenantPrisma.client.voiceVideoMeeting.findFirst({
      where: { id: meetingId, businessId },
    });
    if (!meeting) {
      throw new AppException(
        VOICE_ERROR_CODES.MEETING_NOT_FOUND,
        'Video meeting was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return meeting;
  }

  private async findValidInvite(token: string) {
    return findValidMeetingInvite(this.prisma, token);
  }

  private liveKitConfig() {
    return liveKitVideoConfig(this.config);
  }

  private validateSchedule(value: string, durationMin: number) {
    const scheduledAt = new Date(value);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw this.invalid('Meeting start time must be in the future.');
    }
    if (
      !Number.isInteger(durationMin) ||
      durationMin < 15 ||
      durationMin > 240
    ) {
      throw this.invalid('Meeting duration must be from 15 to 240 minutes.');
    }
    return scheduledAt;
  }

  private validateTimeZone(timeZone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch {
      throw this.invalid('Choose a valid IANA time zone.');
    }
  }

  private invalid(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.MEETING_INVALID,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  private inviteNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.MEETING_INVITE_INVALID,
      'This meeting invite is invalid, expired or revoked.',
      HttpStatus.NOT_FOUND,
    );
  }
}
