import { AppException } from '../filters/app.exception';
import { HttpStatus } from '@nestjs/common';

export interface FileValidationRules {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

/**
 * Sniffs the real content type from file bytes (never trusts the client-sent
 * mimetype/extension) and enforces a size cap (BE-013). Used by every
 * upload endpoint (product photos, CSV/XLSX/docx import, logo upload, etc).
 */
export async function validateUploadedFile(
  file: { buffer: Buffer; size: number; mimetype: string },
  rules: FileValidationRules,
): Promise<void> {
  if (file.size > rules.maxSizeBytes) {
    throw new AppException(
      'FILE_TOO_LARGE',
      `File exceeds the ${Math.floor(rules.maxSizeBytes / 1024 / 1024)}MB limit`,
      HttpStatus.BAD_REQUEST,
    );
  }

  // file-type is ESM-only; dynamic import keeps this file usable from CommonJS.
  const { fileTypeFromBuffer } = await import('file-type');
  const sniffed = await fileTypeFromBuffer(file.buffer);
  const detectedMime = sniffed?.mime ?? file.mimetype;

  if (!rules.allowedMimeTypes.includes(detectedMime)) {
    throw new AppException(
      'UNSUPPORTED_FILE_TYPE',
      `File type "${detectedMime}" is not allowed here`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
