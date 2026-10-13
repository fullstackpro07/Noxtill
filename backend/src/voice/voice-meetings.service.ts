import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { VoiceVideoMeetingStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CreateVoiceMeetingDto,
  CreateVoiceMeetingInviteDto,
  RescheduleVoiceMeetingDto,
  VoiceMeetingReasonDto,
} from './dto/voice-meeting.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

const hashInvite = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class VoiceMeetingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  async list(businessId: string) {
    const meetings = await this.tenantPrisma.client.voiceVideoMeeting.findMany({
      where: { businessId },
      include: {
        host: { include: { user: { select: { id: true, name: true } } } },
        customer: { select: { id: true, name: true } },
        appointment: { select: { id: true, bookingNo: true, status: true } },
        _count: { select: { invites: { where: { revokedAt: null } } } },
        invites: {
          where: { revokedAt: null },
          select: { id: true, email: true, guestName: true, expiresAt: true },
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
      })),
      media: 'not_configured' as const,
      recording: 'not_available' as const,
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

    let customerId = dto.customerId || null;
    if (dto.appointmentId) {
      const appointment =
        await this.tenantPrisma.client.appointment.findFirst({
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
    if (meeting.status !== VoiceVideoMeetingStatus.scheduled) {
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
      before: { scheduledAt: meeting.scheduledAt, durationMin: meeting.durationMin },
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
      meeting.scheduledAt.getTime() + meeting.durationMin * 60_000 + 60 * 60_000,
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
    await this.audit.log({
      entity: 'VoiceMeetingInvite',
      entityId: invite.id,
      action: 'voice.meeting.invite_created',
      after: {
        meetingId,
        emailDomain: dto.email.split('@').pop()?.toLowerCase() ?? null,
        expiresAt,
        tokenReturnedOnce: true,
      },
    });
    return {
      id: invite.id,
      token,
      sharePath: `/meeting/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
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
    await this.audit.log({
      entity: 'VoiceMeetingInvite',
      entityId: invite.id,
      action: 'voice.meeting.invite_revoked',
      after: { reason: dto.reason.trim(), actorUserId },
    });
    return { id: invite.id, revokedAt: revokedAt.toISOString() };
  }

  async previewInvite(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw this.inviteNotFound();
    const now = new Date();
    const invite = await this.prisma.voiceMeetingInvite.findFirst({
      where: {
        tokenHash: hashInvite(token),
        revokedAt: null,
        expiresAt: { gt: now },
        meeting: { status: VoiceVideoMeetingStatus.scheduled },
      },
      include: {
        meeting: {
          include: { business: { select: { name: true } } },
        },
      },
    });
    if (!invite) throw this.inviteNotFound();
    return {
      title: invite.meeting.title,
      businessName: invite.meeting.business.name,
      scheduledAt: invite.meeting.scheduledAt.toISOString(),
      durationMin: invite.meeting.durationMin,
      timeZone: invite.meeting.timeZone,
      expiresAt: invite.expiresAt.toISOString(),
      mediaAvailable: false as const,
      message:
        'This invite is valid for meeting details, but live video, screen sharing and recording are not configured on this server yet.',
    };
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

  private validateSchedule(value: string, durationMin: number) {
    const scheduledAt = new Date(value);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw this.invalid('Meeting start time must be in the future.');
    }
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) {
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
