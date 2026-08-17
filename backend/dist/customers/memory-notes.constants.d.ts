export declare const MEMORY_NOTE_ERROR_CODES: {
    readonly NOTE_NOT_FOUND: "memory_note.not_found";
    readonly SUBJECT_NOT_FOUND: "memory_note.subject_not_found";
    readonly INVALID_SUBJECT_TYPE: "memory_note.invalid_subject_type";
};
export declare const MEMORY_NOTE_SUBJECT_TYPES: readonly ["customer", "supplier", "product", "table"];
export type MemoryNoteSubjectType = (typeof MEMORY_NOTE_SUBJECT_TYPES)[number];
