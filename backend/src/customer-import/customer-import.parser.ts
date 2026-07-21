import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import { extractRawText } from 'mammoth';
import { ClaudeClient } from '../ai/claude.client';
import { RawImportRow } from './customer-import.types';

export interface ImportFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
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
    const isXlsx =
      file.mimetype.includes('sheet') ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    const isDocx =
      file.mimetype.includes('wordprocessingml') ||
      file.originalname.toLowerCase().endsWith('.docx');
    const isCsv =
      file.mimetype.includes('csv') ||
      file.originalname.toLowerCase().endsWith('.csv');

    if (isXlsx) return this.parseXlsx(file.buffer);
    if (isCsv) return this.parseCsv(file.buffer);
    if (isDocx)
      return this.parseUnstructured(await this.docxToText(file.buffer));
    return this.parseUnstructured(file.buffer.toString('utf-8'));
  }

  private parseCsv(buffer: Buffer): RawImportRow[] {
    // eslint and tsc disagree on whether this assertion is redundant (same csv-parse/exceljs
    // typing quirk seen in ProductsImportService); tsc genuinely needs it — do not remove.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const records = parse(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    return records.map((row) => this.toRawRow(row));
  }

  private async parseXlsx(buffer: Buffer): Promise<RawImportRow[]> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const [headerRow, ...dataRows] = sheet.getRows(1, sheet.rowCount) ?? [];
    if (!headerRow) return [];

    const headers = (headerRow.values as (string | undefined)[])
      .slice(1)
      .map((h) => String(h ?? '').trim());
    return dataRows.map((row) => {
      const values = (row.values as (string | number | undefined)[]).slice(1);
      const record = Object.fromEntries(
        headers.map((header, i) => [header, String(values[i] ?? '').trim()]),
      );
      return this.toRawRow(record);
    });
  }

  private toRawRow(row: Record<string, string>): RawImportRow {
    const balanceRaw = row.balance ?? row.openingBalance ?? row.opening_balance;
    const balance = balanceRaw ? Number(balanceRaw) : undefined;
    return {
      name: (row.name ?? '').trim(),
      phone: (row.phone ?? '').trim(),
      balance: balance && !Number.isNaN(balance) ? balance : undefined,
    };
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
