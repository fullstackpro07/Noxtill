import { AppointmentStatus } from '@prisma/client';

/** Valid forward transitions (same flow-guard pattern as ORDER_STATUS_TRANSITIONS). */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  // Booking Requests (UPD-BE-016) — approve() moves requested -> confirmed, decline() -> cancelled.
  requested: [AppointmentStatus.confirmed, AppointmentStatus.cancelled],
  booked: [
    AppointmentStatus.confirmed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  confirmed: [
    AppointmentStatus.completed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  completed: [],
  no_show: [],
  cancelled: [],
};

export const BOOKING_ERROR_CODES = {
  SERVICE_NOT_FOUND: 'BOOKING_SERVICE_NOT_FOUND',
  SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
  NOT_REQUESTED: 'BOOKING_NOT_REQUESTED',
  STAFF_NOT_ELIGIBLE: 'BOOKING_STAFF_NOT_ELIGIBLE',
} as const;

export const REMINDER_RULE_ERROR_CODES = {
  TEST_SEND_TARGET_REQUIRED: 'reminder_rule.test_send_target_required',
} as const;

export const WAITLIST_ERROR_CODES = {
  ENTRY_NOT_FOUND: 'waitlist.entry_not_found',
  NOT_WAITING: 'waitlist.not_waiting',
  NOT_OFFERED: 'waitlist.not_offered',
} as const;

export const QUEUE_ERROR_CODES = {
  TOKEN_NOT_FOUND: 'queue.token_not_found',
  INVALID_TRANSITION: 'queue.invalid_transition',
} as const;

export const DEPOSIT_ERROR_CODES = {
  DEPOSIT_NOT_FOUND: 'deposit.not_found',
  NOT_PENDING: 'deposit.not_pending',
  NOT_CAPTURED: 'deposit.not_captured',
  ONLINE_CAPTURE_NOT_SUPPORTED: 'deposit.online_capture_not_supported',
} as const;

/** How long a waitlist offer stays valid before it's eligible to be treated as expired (informational — nothing auto-expires it yet). */
export const WAITLIST_OFFER_HOLD_HOURS = 24;

/** Deposit settings (UPD-BE-091) — used only as the response shape when a business has never saved settings. */
export const DEFAULT_DEPOSIT_SETTINGS = {
  required: false,
  triggerAfterNoShows: null as number | null,
  amountType: 'flat' as const,
  amountValue: 0,
  applicableServiceIds: [] as string[],
};

/** Booking Link & QR (UPD-BE-090) — same "default shape until saved" pattern as deposit settings. */
export const DEFAULT_BOOKING_LINK_SETTINGS = {
  welcomeText: null as string | null,
  visibleServiceIds: [] as string[],
  brandColor: null as string | null,
};

/**
 * Booking reminder rules (UPD-BE-092) — pre-approved messaging templates a rule may reference.
 * Real WhatsApp/SMS business-initiated messages require pre-approved copy, so "editing the
 * message" means choosing one of these, not writing new freeform text (see `ReminderRule` in
 * schema.prisma).
 */
export const REMINDER_TEMPLATE_KEYS = [
  'booking_reminder',
  'booking_reminder_urgent',
] as const;

/**
 * Fallback used only for a business with zero `ReminderRule` rows — reproduces the exact
 * pre-UPD-BE-092 hardcoded behaviour (`BOOKING_REMINDER_HOUR_OFFSETS`) so existing businesses see
 * no change until they configure their own rules.
 */
export const DEFAULT_REMINDER_RULES: {
  offsetHours: number;
  templateKey: string;
}[] = [
  { offsetHours: 24, templateKey: 'booking_reminder' },
  { offsetHours: 2, templateKey: 'booking_reminder_urgent' },
];
