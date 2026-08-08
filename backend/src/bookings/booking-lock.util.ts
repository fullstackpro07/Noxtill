import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { BOOKING_ERROR_CODES } from './bookings.constants';
import { AppointmentStatus } from '../../generated/prisma';

/**
 * Minimal shape both the raw `PrismaService` transaction client and the tenant-extended
 * `TenantPrismaService` transaction client structurally satisfy — `$extends` wraps the client in a
 * way that isn't nominally assignable to `Prisma.TransactionClient`, so this helper (shared by both
 * flavors) is typed against only the two operations it actually uses.
 */
export interface SlotLockTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): unknown;
  appointment: {
    findFirst(args: { where: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * Serializes concurrent bookings/reschedules for the same staff-or-service + time slot with a
 * Postgres advisory transaction lock, then re-checks for a conflicting appointment inside the
 * transaction — whichever caller grabs the lock first wins, the loser sees a real conflict on its
 * own re-check and throws a 409, never a duplicate booking. Callers must invoke this inside their
 * own `$transaction`.
 */
export async function assertSlotAvailable(
  tx: SlotLockTx,
  params: {
    businessId: string;
    staffId?: string | null;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    excludeAppointmentId?: string;
  },
): Promise<void> {
  const lockKey = `${params.businessId}:${params.staffId ?? params.serviceId}:${params.startsAt.toISOString()}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const conflict = await tx.appointment.findFirst({
    where: {
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
      businessId: params.businessId,
      ...(params.staffId ? { staffUserId: params.staffId } : {}),
      status: { notIn: [AppointmentStatus.cancelled] },
      startsAt: { lt: params.endsAt },
      endsAt: { gt: params.startsAt },
    },
  });
  if (conflict) {
    throw new AppException(
      BOOKING_ERROR_CODES.SLOT_UNAVAILABLE,
      'That slot was just taken',
      HttpStatus.CONFLICT,
    );
  }
}
