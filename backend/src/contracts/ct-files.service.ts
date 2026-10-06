import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import mammoth from 'mammoth';
import { S3Service } from '../common/storage/s3.service';
import { ctErr } from './ct-context.service';
import { CT_ERRORS, CtConfig } from './ct.constants';

export type Upload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface Stored {
  storageKey: string;
  fileName: string;
  mime: string;
  size: number;
  sha256: string;
  /** Extracted plain text (PDF / DOCX / TXT), null when the type has no text layer or extraction failed. */
  text: string | null;
  /** Why text isn't available (shown as the document's processing note), null when it is. */
  problem: string | null;
}

const MIME: Record<string, string> = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PNG: 'image/png',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  TXT: 'text/plain',
  ZIP: 'application/zip',
};

export const sha256 = (b: Buffer | string) =>
  createHash('sha256').update(b).digest('hex');

/**
 * Private object storage for Contracts: type/size checks against settings, SHA-256 of the exact
 * stored bytes, and plain-text extraction (PDF via pdf-parse, DOCX via mammoth, TXT as-is) used for
 * version comparison and the public signing page. No malware scanner is connected — files are
 * checked for type and size only (disclosed in Settings › File settings).
 */
@Injectable()
export class CtFilesService {
  private readonly log = new Logger(CtFilesService.name);

  constructor(private readonly s3: S3Service) {}

  ext(name: string) {
    const e = (name.split('.').pop() ?? '').toUpperCase();
    return e === 'JPEG' ? 'JPG' : e;
  }

  check(cfg: CtConfig, f: Upload) {
    const e = this.ext(f.originalname);
    if (!cfg.files.types.includes(e))
      throw ctErr(
        CT_ERRORS.FILE,
        `UNSUPPORTED_FILE — ${f.originalname} isn’t an allowed type (${cfg.files.types.join(', ')}).`,
      );
    if (f.size > cfg.files.maxMb * 1048576)
      throw ctErr(
        CT_ERRORS.TOO_LARGE,
        `FILE_TOO_LARGE — ${f.originalname} is over ${cfg.files.maxMb} MB.`,
      );
    if (!f.size) throw ctErr(CT_ERRORS.FILE, `${f.originalname} is empty.`);
  }

  async text(
    name: string,
    buf: Buffer,
  ): Promise<{ text: string | null; problem: string | null }> {
    const e = this.ext(name);
    try {
      if (e === 'TXT') return { text: buf.toString('utf8'), problem: null };
      if (e === 'DOCX')
        return {
          text: (await mammoth.extractRawText({ buffer: buf })).value ?? '',
          problem: null,
        };
      if (e === 'PDF') {
        // Loaded lazily — pdf-parse reads a sample file at import time in some versions.
        const mod = (await import('pdf-parse')) as unknown as {
          default: (b: Buffer) => Promise<{ text?: string }>;
        };
        const pdfParse = mod.default;
        const t = ((await pdfParse(buf)).text ?? '').trim();
        return t
          ? { text: t, problem: null }
          : {
              text: null,
              problem:
                'No text layer — scanned PDF. Text comparison isn’t available for this version.',
            };
      }
      return { text: null, problem: null };
    } catch (err) {
      this.log.warn(
        `Text extraction failed for ${name}: ${(err as Error).message}`,
      );
      return {
        text: null,
        problem: `Text extraction failed (${e}) — the file is stored; comparison and the signing preview use the download only.`,
      };
    }
  }

  async store(
    rootId: string,
    cfg: CtConfig | null,
    f: Upload,
  ): Promise<Stored> {
    if (cfg) this.check(cfg, f);
    const e = this.ext(f.originalname);
    const key = `contracts/${rootId}/${Date.now()}-${randomBytes(6).toString('hex')}.${e.toLowerCase() || 'bin'}`;
    const mime = MIME[e] ?? (f.mimetype || 'application/octet-stream');
    await this.s3.upload(key, f.buffer, mime);
    const t = await this.text(f.originalname, f.buffer);
    return {
      storageKey: key,
      fileName: f.originalname.slice(0, 255),
      mime,
      size: f.size,
      sha256: sha256(f.buffer),
      ...t,
    };
  }

  /** A generated contract / amendment body stored as a real text file (so it has bytes and a hash). */
  async storeText(rootId: string, name: string, body: string): Promise<Stored> {
    const buf = Buffer.from(body, 'utf8');
    return this.store(rootId, null, {
      originalname: `${name.replace(/[^\w.-]+/g, '_').slice(0, 80)}.txt`,
      mimetype: 'text/plain',
      size: buf.length,
      buffer: buf,
    });
  }

  /** Short-lived link (5 minutes) — raw storage paths are never exposed. */
  url(key: string, seconds = 300) {
    return this.s3.getSignedDownloadUrl(key, seconds);
  }

  read(key: string) {
    return this.s3.readObject(key);
  }

  async verify(key: string | null, hash: string | null) {
    if (!key || !hash) return null;
    const b = await this.s3.readObject(key);
    if (!b)
      throw ctErr(
        CT_ERRORS.NOT_FOUND,
        'The stored file is missing.',
        HttpStatus.NOT_FOUND,
      );
    return sha256(b) === hash;
  }

  async remove(key: string | null) {
    if (key) await this.s3.delete(key).catch(() => null);
  }
}
