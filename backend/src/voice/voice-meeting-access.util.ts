import { createHash } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { VOICE_ERROR_CODES } from './voice.constants';

export function liveKitVideoConfig(config: ConfigService) {
  const value = config.get<string>('LIVEKIT_URL')?.trim();
  const apiKey = config.get<string>('LIVEKIT_API_KEY')?.trim();
  const apiSecret = config.get<string>('LIVEKIT_API_SECRET')?.trim();
  if (!value || !apiKey || !apiSecret) return null;
  try {
    const url = new URL(value);
    if (
      !['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
    const wsUrl = url.toString().replace(/\/+$/, '');
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    return {
      url: wsUrl,
      httpUrl: url.toString().replace(/\/+$/, ''),
      apiKey,
      apiSecret,
    };
  } catch {
    return null;
  }
}

export function assertMeetingJoinWindow(meeting: {
  status: string;
  endRequestedAt: Date | null;
  scheduledAt: Date;
  durationMin: number;
}) {
  const now = Date.now();
  if (
    meeting.status !== 'scheduled' ||
    meeting.endRequestedAt ||
    now < meeting.scheduledAt.getTime() - 15 * 60_000 ||
    now >= meeting.scheduledAt.getTime() + (meeting.durationMin + 60) * 60_000
  ) {
    throw new AppException(
      VOICE_ERROR_CODES.MEETING_INVALID,
      'This meeting is outside its video join window.',
    );
  }
}

export async function findValidMeetingInvite(
  prisma: PrismaService,
  token: string,
) {
  const invalid = () =>
    new AppException(
      VOICE_ERROR_CODES.MEETING_INVITE_INVALID,
      'This meeting invite is invalid, expired or revoked.',
      HttpStatus.NOT_FOUND,
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const invite = await prisma.voiceMeetingInvite.findFirst({
    where: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      meeting: { status: 'scheduled', endRequestedAt: null },
    },
    include: { meeting: { include: { business: { select: { name: true } } } } },
  });
  if (!invite) throw invalid();
  return invite;
}
