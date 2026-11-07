import { HttpStatus } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { BOOKING_ERROR_CODES } from './bookings.constants';

interface BufferCheckTx {
  appointment: {
    findMany(args: {
      where: Record<string, unknown>;
      include: { service: true };
    }): Promise<
      {
        startsAt: Date;
        endsAt: Date;
        service: {
          bufferBeforeMin: number | null;
          bufferAfterMin: number | null;
        } | null;
      }[]
    >;
  };
}

function widen(
  startsAt: Date,
  endsAt: Date,
  before?: number | null,
  after?: number | null,
) {
  return {
    start: new Date(startsAt.getTime() - (before ?? 0) * 60_000),
    end: new Date(endsAt.getTime() + (after ?? 0) * 60_000),
  };
}

/** Symmetric canonical service buffers, shared by internal creation and phone changes. */
export async function assertBufferAvailable(
  tx: BufferCheckTx,
  params: {
    businessId: string;
    staffId?: string | null;
    startsAt: Date;
    endsAt: Date;
    bufferBeforeMin?: number | null;
    bufferAfterMin?: number | null;
    excludeAppointmentId?: string;
    checkUnassigned?: boolean;
  },
): Promise<void> {
  if (!params.staffId && !params.checkUnassigned) return;
  const mine = widen(
    params.startsAt,
    params.endsAt,
    params.bufferBeforeMin,
    params.bufferAfterMin,
  );
  const nearby = await tx.appointment.findMany({
    where: {
      businessId: params.businessId,
      ...(params.staffId ? { staffUserId: params.staffId } : {}),
      status: { notIn: [AppointmentStatus.cancelled] },
      ...(params.excludeAppointmentId
        ? { id: { not: params.excludeAppointmentId } }
        : {}),
      startsAt: { lt: new Date(params.endsAt.getTime() + 86_400_000) },
      endsAt: { gt: new Date(params.startsAt.getTime() - 86_400_000) },
    },
    include: { service: true },
  });
  for (const candidate of nearby) {
    const theirs = widen(
      candidate.startsAt,
      candidate.endsAt,
      candidate.service?.bufferBeforeMin,
      candidate.service?.bufferAfterMin,
    );
    if (mine.start < theirs.end && mine.end > theirs.start) {
      throw new AppException(
        BOOKING_ERROR_CODES.SLOT_UNAVAILABLE,
        'That slot is too close to another appointment for the configured service buffer',
        HttpStatus.CONFLICT,
      );
    }
  }
}
