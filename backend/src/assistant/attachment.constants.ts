/** Chat attachments (Business Chat). Deliberately separate from the Photo Digitizer's constants:
 * the digitizer stages rows for a confirmed import into real tables, whereas an attachment here is
 * only ever read into the model's context for one question — nothing is written anywhere. */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Extracted text is prepended to the user's question, so it has to stay well inside the model's
 * context budget. Anything longer is cut here and reported back as `truncated` so the UI can say
 * so rather than silently dropping half a document. */
export const MAX_EXTRACTED_CHARS = 20000;

export const PDF_MIME_TYPE = 'application/pdf';
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Plain-text-ish types read straight as UTF-8 — no parser needed. */
export const TEXT_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/tab-separated-values',
  'application/json',
] as const;

/** Claude Vision handles these; same set the Digitizer's vision path already accepts. */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AttachmentKind = 'pdf' | 'docx' | 'text' | 'image';

export const ATTACHMENT_ERROR_CODES = {
  UNSUPPORTED_TYPE: 'ATTACHMENT_UNSUPPORTED_TYPE',
  TOO_LARGE: 'ATTACHMENT_TOO_LARGE',
  EMPTY: 'ATTACHMENT_NO_TEXT',
  EXTRACTION_FAILED: 'ATTACHMENT_EXTRACTION_FAILED',
} as const;

/** `AiCallLog.kind` for the vision call an image attachment makes. Intentionally not in
 * `KIND_TO_FEATURE` — it rolls up under "Other AI usage" in AI Settings rather than pretending to
 * be one of the seven named, independently-toggleable features. */
export const ATTACHMENT_AI_CALL_KIND = 'assistant_attachment';
