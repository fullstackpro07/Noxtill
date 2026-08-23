import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import { extractRawText } from 'mammoth';
import { ClaudeClient } from '../ai/claude.client';
import { RawImportRow } from './customer-import.types';
import {
  applyMapping,
  suggestMapping,
} from './customer-import-mapping.constants';

export interface ImportFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface RawRecords {
  headers: string[];
  rows: Record<string, string>[];
}

const CLAUDE_CHUNK_SIZE = 6000;

/**
 * Parses every supported customer-import format into raw {name, phone, balance?}
 * rows (BE-042 step 1). csv/xlsx are structured; txt/docx are unstructured and
 * go through Claude extraction, chunked, at temperature 0 (spec §4.7).
 */
@Injectable()
export class CustomerImportParser {
  private readonly logger = new Logger(CustomerImportParser.name);

  constructor(private readonly claude: ClaudeClient) {}

  async parse(file: ImportFile): Promise<RawImportRow[]> {
    const records = await this.parseRecords(file);
    if (records) {
      return applyMapping(records.rows, suggestMapping(records.headers));
    }
    return this.parseUnstructured(await this.readAsText(file));
  }

  /** Column-mapping (UPD-BE-099) — raw header-keyed rows for csv/xlsx, null for txt/docx (Claude already returns structured fields, nothing to map). */
  async parseRecords(file: ImportFile): Promise<RawRecords | null> {
    if (this.isXlsx(file)) return this.parseXlsxRecords(file.buffer);
    if (this.isCsv(file)) return this.parseCsvRecords(file.buffer);
    return null;
  }

  private isXlsx(file: ImportFile): boolean {
    return (
      file.mimetype.includes('sheet') ||
      file.originalname.toLowerCase().endsWith('.xlsx')
    );
  }

  private isDocx(file: ImportFile): boolean {
    return (
      file.mimetype.includes('wordprocessingml') ||
      file.originalname.toLowerCase().endsWith('.docx')
    );
  }

  private isCsv(file: ImportFile): boolean {
    return (
      file.mimetype.includes('csv') ||
      file.originalname.toLowerCase().endsWith('.csv')
    );
  }

  private async readAsText(file: ImportFile): Promise<string> {
    if (this.isDocx(file)) return this.docxToText(file.buffer);
    return file.buffer.toString('utf-8');
  }

  private parseCsvRecords(buffer: Buffer): RawRecords {
    // eslint and tsc disagree on whether this assertion is redundant (same csv-parse/exceljs
    // typing quirk seen in ProductsImportService); tsc genuinely needs it — do not remove.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const records = parse(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, rows: records };
  }

  private async parseXlsxRecords(buffer: Buffer): Promise<RawRecords> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const [headerRow, ...dataRows] = sheet.getRows(1, sheet.rowCount) ?? [];
    if (!headerRow) return { headers: [], rows: [] };

    const headers = (headerRow.values as (string | undefined)[])
      .slice(1)
      .map((h) => String(h ?? '').trim());
    const rows = dataRows.map((row) => {
      const values = (row.values as (string | number | undefined)[]).slice(1);
      return Object.fromEntries(
        headers.map((header, i) => [header, String(values[i] ?? '').trim()]),
      );
    });
    return { headers, rows };
  }

  private async docxToText(buffer: Buffer): Promise<string> {
    const result = await extractRawText({ buffer });
    return result.value;
  }

  /** Unstructured text (txt/docx) → Claude extraction, chunked, temperature 0. */
  private async parseUnstructured(text: string): Promise<RawImportRow[]> {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CLAUDE_CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CLAUDE_CHUNK_SIZE));
    }

    const rows: RawImportRow[] = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const prompt = [
        'Extract customer contact records from the text below.',
        'Return ONLY a JSON array (no markdown fences, no prose) of objects shaped like:',
        '{"name": string, "phone": string, "balance": number | null}',
        '"balance" is an opening credit balance if mentioned, otherwise null. Skip lines with no name or phone.',
        '---',
        chunk,
      ].join('\n');

      try {
        const response = await this.claude.complete(prompt, 0);
        const parsed = JSON.parse(this.stripCodeFences(response)) as {
          name: string;
          phone: string;
          balance?: number | null;
        }[];
        for (const row of parsed) {
          if (row.name && row.phone) {
            rows.push({
              name: row.name,
              phone: row.phone,
              balance: row.balance ?? undefined,
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          `Claude extraction chunk failed: ${(error as Error).message}`,
        );
      }
    }

    return rows;
  }

  private stripCodeFences(text: string): string {
    return text
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();
  }
}
