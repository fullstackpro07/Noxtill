import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { AiInfraService } from '../ai/ai-infra.service';
import { VISION_MODEL } from '../ai/claude.client';
import { AppException } from '../common/filters/app.exception';
import {
  ATTACHMENT_AI_CALL_KIND,
  ATTACHMENT_ERROR_CODES,
  AttachmentKind,
  DOCX_MIME_TYPE,
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_EXTRACTED_CHARS,
  PDF_MIME_TYPE,
  TEXT_MIME_TYPES,
} from './attachment.constants';

export interface ExtractedAttachment {
  filename: string;
  mimeType: string;
  kind: AttachmentKind;
  /** The real text pulled out of the file — this is exactly what gets prepended to the question. */
  text: string;
  charCount: number;
  /** True when the document was longer than `MAX_EXTRACTED_CHARS` and was cut. */
  truncated: boolean;
}

type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/**
 * Business Chat attachments (read-only). `/assistant/chat` has no file field — it takes one text
 * message — so an attachment is turned into text here and the caller prepends it to the question.
 * Nothing is written to any business table: this is deliberately NOT the Photo Digitizer path,
 * which stages rows for a confirmed import.
 *
 * Real extraction per type: `pdf-parse` for PDFs, `mammoth` for .docx, a UTF-8 read for
 * text/CSV/JSON/Markdown, and Claude Vision (the same `VISION_MODEL` the digitizer uses) for
 * images. An unsupported type is rejected outright rather than silently attached as an empty file.
 */
@Injectable()
export class AssistantAttachmentService {
  private readonly logger = new Logger(AssistantAttachmentService.name);

  constructor(private readonly aiInfra: AiInfraService) {}

  async extract(
    businessId: string,
    file: Express.Multer.File,
  ): Promise<ExtractedAttachment> {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppException(
        ATTACHMENT_ERROR_CODES.TOO_LARGE,
        `That file is larger than ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))}MB — attach a smaller one.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const mimeType = file.mimetype;
    const kind = this.kindFor(mimeType, file.originalname);

    let raw: string;
    if (kind === 'pdf') raw = await this.readPdf(file.buffer);
    else if (kind === 'docx') raw = await this.readDocx(file.buffer);
    else if (kind === 'text') raw = file.buffer.toString('utf8');
    else raw = await this.readImage(businessId, file.buffer, mimeType);

    const text = raw.replace(/\s+\n/g, '\n').trim();
    if (!text) {
      throw new AppException(
        ATTACHMENT_ERROR_CODES.EMPTY,
        "I couldn't read any text out of that file — it may be empty or a scan with no readable text.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const truncated = text.length > MAX_EXTRACTED_CHARS;
    return {
      filename: file.originalname,
      mimeType,
      kind,
      text: truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text,
      charCount: text.length,
      truncated,
    };
  }

  private kindFor(mimeType: string, filename: string): AttachmentKind {
    if (mimeType === PDF_MIME_TYPE) return 'pdf';
    if (mimeType === DOCX_MIME_TYPE) return 'docx';
    if ((TEXT_MIME_TYPES as readonly string[]).includes(mimeType)) return 'text';
    if ((IMAGE_MIME_TYPES as readonly string[]).includes(mimeType))
      return 'image';

    // Some browsers send an empty or generic mimetype for .csv/.md — fall back to the extension
    // rather than rejecting a file we can genuinely read.
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (['txt', 'csv', 'tsv', 'md', 'json'].includes(ext)) return 'text';

    throw new AppException(
      ATTACHMENT_ERROR_CODES.UNSUPPORTED_TYPE,
      'That file type is not supported — attach a PDF, Word document, spreadsheet export (CSV), text file, or photo.',
      HttpStatus.BAD_REQUEST,
    );
  }

  private async readPdf(buffer: Buffer): Promise<string> {
    try {
      // Required lazily: pdf-parse's index reads a sample file from disk at import time in some
      // versions, which breaks under Jest module collection — the library entry point itself is fine.
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      return parsed.text ?? '';
    } catch (error) {
      this.logger.warn(`PDF extraction failed: ${(error as Error).message}`);
      throw new AppException(
        ATTACHMENT_ERROR_CODES.EXTRACTION_FAILED,
        "I couldn't read that PDF — it may be password-protected or a pure image scan.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async readDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    } catch (error) {
      this.logger.warn(`DOCX extraction failed: ${(error as Error).message}`);
      throw new AppException(
        ATTACHMENT_ERROR_CODES.EXTRACTION_FAILED,
        "I couldn't read that Word document — try saving it as a PDF or text file.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Real Claude Vision read — same model the Photo Digitizer uses, but asked for prose rather
   * than importable rows, since this is only ever fed back as context for a question. */
  private async readImage(
    businessId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    try {
      const result = await this.aiInfra.createMessage(
        businessId,
        ATTACHMENT_AI_CALL_KIND,
        {
          model: VISION_MODEL,
          temperature: 0,
          maxTokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as ImageMimeType,
                    data: buffer.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: [
                    'Transcribe everything readable in this image as plain text.',
                    'Preserve any table or line-item structure using simple rows.',
                    'Do not summarise, interpret, or add anything that is not visibly present.',
                    'If part of it is unreadable, write [unreadable] for that part rather than guessing.',
                  ].join(' '),
                },
              ],
            },
          ],
        },
      );
      return result.content.find((block) => block.type === 'text')?.text ?? '';
    } catch (error) {
      this.logger.warn(`Image extraction failed: ${(error as Error).message}`);
      throw new AppException(
        ATTACHMENT_ERROR_CODES.EXTRACTION_FAILED,
        'Reading images is not available right now — please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
