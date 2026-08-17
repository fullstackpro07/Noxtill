import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { BOOKING_ERROR_CODES } from './bookings.constants';
import { AppointmentStatus } from '@prisma/client';

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
 * MySQL row lock (`SELECT ... FOR UPDATE` on a dedicated `slot_locks` row, upserted first via
 * `INSERT ... ON DUPLICATE KEY UPDATE`), then re-checks for a conflicting appointment inside the
 * transaction — whichever caller grabs the lock first wins, the loser sees a real conflict on its
 * own re-check and throws a 409, never a duplicate booking. InnoDB holds the row lock until
 * COMMIT/ROLLBACK, giving the same transaction-scoped mutex semantics Postgres's
 * `pg_advisory_xact_lock` provided (see `SlotLock` in schema.prisma). Callers must invoke this
 * inside their own `$transaction`.
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
  await tx.$executeRaw`INSERT INTO slot_locks (lock_key) VALUES (${lockKey}) ON DUPLICATE KEY UPDATE lock_key = lock_key`;
  await tx.$executeRaw`SELECT lock_key FROM slot_locks WHERE lock_key = ${lockKey} FOR UPDATE`;

  const conflict = await tx.appointment.findFirst({
    where: {
      ...(params.excludeAppointmentId
        ? { id: { not: params.excludeAppointmentId } }
        : {}),
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
