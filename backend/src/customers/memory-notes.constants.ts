export const MEMORY_NOTE_ERROR_CODES = {
  NOTE_NOT_FOUND: 'memory_note.not_found',
  SUBJECT_NOT_FOUND: 'memory_note.subject_not_found',
  INVALID_SUBJECT_TYPE: 'memory_note.invalid_subject_type',
} as const;

export const MEMORY_NOTE_SUBJECT_TYPES = [
  'customer',
  'supplier',
  'product',
  'table',
] as const;

export type MemoryNoteSubjectType = (typeof MEMORY_NOTE_SUBJECT_TYPES)[number];
