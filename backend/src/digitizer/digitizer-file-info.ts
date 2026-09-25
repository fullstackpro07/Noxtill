import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { DIGITIZER_ERROR_CODES, MAX_PDF_PAGES } from './digitizer.constants';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Reads the pixel size straight from the image header — real numbers about the file the owner
 * uploaded, with no image library. Returns null when the header is not recognisable.
 */
export function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): ImageDimensions | null {
  try {
    if (mimeType === 'image/png') return readPng(buffer);
    if (mimeType === 'image/jpeg') return readJpeg(buffer);
    if (mimeType === 'image/webp') return readWebp(buffer);
  } catch {
    return null;
  }
  return null;
}

function readPng(b: Buffer): ImageDimensions | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function readJpeg(b: Buffer): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1];
    // Start-of-frame markers (baseline, progressive, …) carry the size; 0xC4/0xC8/0xCC are not frames.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: b.readUInt16BE(offset + 5),
        width: b.readUInt16BE(offset + 7),
      };
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    offset += 2 + b.readUInt16BE(offset + 2);
  }
  return null;
}

function readWebp(b: Buffer): ImageDimensions | null {
  if (
    b.length < 30 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return {
      width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
      height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
    };
  }
  return null;
}

/** Real page count of a PDF; rejects a document longer than the product's page limit. */
export async function readPdfPageCount(buffer: Buffer): Promise<number> {
  // Required lazily: pdf-parse's index reads a sample file from disk at import time in some setups.
  const { default: pdfParse } = (await import('pdf-parse')) as unknown as {
    default: (
      data: Buffer,
      options?: { max?: number },
    ) => Promise<{ numpages: number }>;
  };
  const parsed = await pdfParse(buffer, { max: 1 });
  const pages = parsed.numpages;
  if (pages > MAX_PDF_PAGES) {
    throw new AppException(
      DIGITIZER_ERROR_CODES.TOO_MANY_PAGES,
      `This PDF has ${pages} pages — the limit is ${MAX_PDF_PAGES} per document.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return pages;
}

/** Whether the pixel size is enough to read small handwriting: the shorter side must reach 800px. */
export function isResolutionAdequate(d: ImageDimensions): boolean {
  return Math.min(d.width, d.height) >= 800;
}
