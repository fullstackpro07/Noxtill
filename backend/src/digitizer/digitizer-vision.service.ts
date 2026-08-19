import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { VISION_MODEL } from '../ai/claude.client';
import { AppException } from '../common/filters/app.exception';
import { DigitizerAliasService } from './digitizer-alias.service';
import {
  DEFAULT_DESTINATION_BY_SCANNER_TYPE,
  DIGITIZER_ERROR_CODES,
} from './digitizer.constants';
import {
  DigitizerDestination,
  DigitizerRow,
  ScannerType,
} from './digitizer.types';

interface RawVisionRow {
  destination?: string;
  data?: Record<string, unknown>;
  confidence?: number;
}

const DESTINATION_FIELD_GUIDE = [
  'customer: {"name": string, "phone": string, "balance"?: number (opening credit owed)}',
  'product: {"name": string, "sellingPrice": number, "costPrice"?: number, "sku"?: string, "stockQty"?: number}',
  'expense: {"description": string, "amount": number, "category"?: string, "incurredOn"?: "YYYY-MM-DD"}',
  'supplier: {"name": string, "phone"?: string, "email"?: string}',
  'credit_opening_balance: {"customerName": string, "phone": string, "amount": number}',
].join('\n');

/**
 * Real Claude Vision extraction (UPD-BE-060) — generalizes the parse-then-stage shape already
 * proven by `CustomerImportParser`'s Claude text-extraction path (BE-042), just with an image
 * content block instead of chunked text, and a per-row `destination` instead of one fixed target
 * table. Every row is confidence-scored by the model itself; nothing here writes to the database —
 * that only happens once the owner reviews and commits (UPD-BE-061/062).
 */
@Injectable()
export class DigitizerVisionService {
  private readonly logger = new Logger(DigitizerVisionService.name);

  constructor(
    private readonly aiInfra: AiInfraService,
    private readonly aliases: DigitizerAliasService,
  ) {}

  async extract(
    businessId: string,
    scannerType: ScannerType,
    imageBuffer: Buffer,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<DigitizerRow[]> {
    const defaultDestination = DEFAULT_DESTINATION_BY_SCANNER_TYPE[scannerType];
    const prompt = this.buildPrompt(scannerType, defaultDestination);

    let raw: string;
    try {
      const result = await this.aiInfra.createMessage(
        businessId,
        'digitizer_scan',
        {
          model: VISION_MODEL,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: imageBuffer.toString('base64'),
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        },
      );
      raw = result.content.find((block) => block.type === 'text')?.text ?? '';
    } catch (error) {
      this.logger.warn(
        `Digitizer vision extraction failed: ${(error as Error).message}`,
      );
      throw new AppException(
        DIGITIZER_ERROR_CODES.EXTRACTION_UNAVAILABLE,
        'Photo scanning is not available right now — please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const parsed = this.parseRows(raw, defaultDestination);
    const aliasMap = await this.aliases.getMap(businessId);
    return parsed.map((row) => this.applyAliasesToRow(row, aliasMap));
  }

  private buildPrompt(
    scannerType: ScannerType,
    defaultDestination: DigitizerDestination | null,
  ): string {
    return [
      `You are extracting structured records from a photographed ${scannerType.replace('_', ' ')}.`,
      'Return ONLY a JSON array (no markdown fences, no prose) of objects shaped like:',
      '{"destination": one of "customer" | "product" | "expense" | "supplier" | "credit_opening_balance", "data": {...fields for that destination}, "confidence": number 0-1}',
      'Field shapes per destination:',
      DESTINATION_FIELD_GUIDE,
      defaultDestination
        ? `Every row here is almost certainly "${defaultDestination}" — only use a different destination if the photo clearly contains something else.`
        : 'This photo may contain a mix of different record types — pick the correct destination per row.',
      '"confidence" reflects how legible/certain that specific row\'s extraction is — a smudged or partially-cut-off line should score lower, never fabricated as high confidence.',
      'Skip anything illegible or empty rather than guessing. Never invent a row that is not really in the photo.',
    ].join('\n\n');
  }

  private parseRows(
    raw: string,
    defaultDestination: DigitizerDestination | null,
  ): DigitizerRow[] {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const rows: DigitizerRow[] = [];
    for (const item of parsed as RawVisionRow[]) {
      const destination = this.resolveDestination(
        item.destination,
        defaultDestination,
      );
      if (!destination || !item.data || typeof item.data !== 'object') continue;

      rows.push({
        id: randomUUID(),
        destination,
        data: item.data as DigitizerRow['data'],
        confidence:
          typeof item.confidence === 'number'
            ? Math.min(1, Math.max(0, item.confidence))
            : 0,
        corrected: false,
        action: 'commit',
      });
    }
    return rows;
  }

  private resolveDestination(
    value: string | undefined,
    fallback: DigitizerDestination | null,
  ): DigitizerDestination | null {
    const valid: DigitizerDestination[] = [
      'customer',
      'product',
      'expense',
      'supplier',
      'credit_opening_balance',
    ];
    if (value && (valid as string[]).includes(value)) {
      return value as DigitizerDestination;
    }
    return fallback;
  }

  /** Applies every known alias across every string-valued field — a misread can land in
   * whichever field the destination uses for free text (`name`, `description`, `customerName`, ...). */
  private applyAliasesToRow(
    row: DigitizerRow,
    aliasMap: Map<string, string>,
  ): DigitizerRow {
    if (aliasMap.size === 0) return row;

    let changed = false;
    const data = { ...row.data };
    for (const [field, value] of Object.entries(data)) {
      if (typeof value !== 'string') continue;
      const corrected = this.aliases.applyAliases(value, aliasMap);
      if (corrected !== value) {
        data[field] = corrected;
        changed = true;
      }
    }
    return changed ? { ...row, data } : row;
  }
}
