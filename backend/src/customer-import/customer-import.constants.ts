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
