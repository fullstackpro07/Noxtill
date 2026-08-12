export const CASH_REGISTER_ERROR_CODES = {
  SHIFT_ALREADY_OPEN: 'cash_register.shift_already_open',
  NO_OPEN_SHIFT: 'cash_register.no_open_shift',
  VARIANCE_NOTE_REQUIRED: 'cash_register.variance_note_required',
};

/** A counted-vs-expected gap under this amount doesn't need an explanation (spec: "beyond threshold"). */
export const VARIANCE_NOTE_THRESHOLD = 10;
