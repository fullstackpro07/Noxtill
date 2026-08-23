import { ALLOWED_IMAGE_MIME_TYPES } from '../digitizer/digitizer.constants';

export const CUSTOMER_IMPORT_QUEUE = 'customer-import';
export const EXECUTE_BATCH_SIZE = 500;
export const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMPORT_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Import Customers, photo path (UPD-BE-099) — real image uploads accepted alongside the text formats above. */
export const ALLOWED_IMPORT_MIME_TYPES_WITH_PHOTO = [
  ...ALLOWED_IMPORT_MIME_TYPES,
  ...ALLOWED_IMAGE_MIME_TYPES,
];

export const CUSTOMER_IMPORT_ERROR_CODES = {
  NO_COLUMN_MAPPING: 'customer_import.no_column_mapping',
  ALREADY_CONFIRMED: 'customer_import.already_confirmed',
} as const;
