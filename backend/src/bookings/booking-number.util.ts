/**
 * The raw operations `nextBookingNo` needs — satisfied by both the plain `PrismaService` transaction
 * client and the tenant-extended one (same reasoning as `SlotLockTx`).
 */
export interface BookingNoTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): unknown;
  $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

/**
 * Allocates the next human-readable booking number (BK-1042) for a business. Callers must invoke this
 * inside the same `$transaction` that creates the appointment.
 *
 * Two things make it safe under concurrency: (1) a per-business `slot_locks` row is taken first and held
 * until COMMIT/ROLLBACK, so bookings for the same business allocate one at a time; and (2) the current
 * highest number is read with `FOR UPDATE` — a *current* read. A plain `MAX()` is a consistent read
 * against the transaction's snapshot, which was already established by the slot-availability check
 * earlier in the transaction, so it would keep returning the number from before the previous booking
 * committed and hand two bookings the same number.
 */
export async function nextBookingNo(
  tx: BookingNoTx,
  businessId: string,
): Promise<number> {
  const lockKey = `booking-no:${businessId}`;
  await tx.$executeRaw`INSERT INTO slot_locks (lock_key) VALUES (${lockKey}) ON DUPLICATE KEY UPDATE lock_key = lock_key`;
  await tx.$executeRaw`SELECT lock_key FROM slot_locks WHERE lock_key = ${lockKey} FOR UPDATE`;
  const rows = await tx.$queryRaw<{ booking_no: number }[]>`
    SELECT booking_no FROM appointments
    WHERE business_id = ${businessId} AND booking_no IS NOT NULL
    ORDER BY booking_no DESC LIMIT 1 FOR UPDATE
  `;
  return rows.length ? Number(rows[0].booking_no) + 1 : 1;
}

/** How a booking number is shown wherever a booking is referenced, e.g. `BK-1042`. */
export function formatBookingNo(
  bookingNo: number | null | undefined,
): string | null {
  return bookingNo == null ? null : `BK-${bookingNo}`;
}
