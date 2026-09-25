import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { AnthropicContentBlock } from '../ai/claude.client';
import { AppException } from '../common/filters/app.exception';
import { DigitizerAliasService } from './digitizer-alias.service';
import {
  DEFAULT_DESTINATION_BY_SCANNER_TYPE,
  DIGITIZER_ERROR_CODES,
  DIGITIZER_MODEL,
  DESTINATIONS,
  DOCUMENT_KINDS,
  PDF_MIME_TYPE,
} from './digitizer.constants';
import { KIND_BY_SCANNER_TYPE } from './digitizer-fields';
import {
  DigitizerDestination,
  DigitizerRow,
  DigitizerRowData,
  DocumentKind,
  ExtractionResult,
  FieldRegion,
  LedgerData,
  LineItem,
  Legibility,
  QualityAssessment,
  ScannerType,
} from './digitizer.types';

type RawObject = Record<string, unknown>;

export type DigitizerMediaType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const DESTINATION_FIELD_GUIDE = [
  'customer: {"name": string, "phone": string, "email"?: string, "address"?: string, "notes"?: string, "balance"?: number (opening credit owed)}',
  'product: {"name": string, "sellingPrice"?: number, "costPrice"?: number, "sku"?: string, "stockQty"?: number, "category"?: string}',
  'expense: {"description": string, "amount": number, "category"?: string, "incurredOn"?: "YYYY-MM-DD"}',
  'supplier: {"name": string, "phone"?: string, "email"?: string, "address"?: string}',
  'credit_opening_balance: {"customerName": string, "phone": string, "amount": number}',
  'inventory: {"name"?: string, "sku"?: string, "countedQty": number}',
].join('\n');

/**
 * Real Claude extraction (UPD-BE-060) for a photo or a PDF. It returns the rows *and* the model's
 * own report about the document — type, handwriting, language, image quality, line items, printed
 * totals, ledger entries. Nothing here writes to the database; every number the screens show is
 * later computed from this output, never typed in.
 */
@Injectable()
export class DigitizerVisionService {
  private readonly logger = new Logger(DigitizerVisionService.name);

  constructor(
    private readonly aiInfra: AiInfraService,
    private readonly aliases: DigitizerAliasService,
  ) {}

  /**
   * Rows only — the shape `CustomerImportService`'s photo path has always consumed. Use
   * `extractDocument` when the model's report about the document itself is needed too.
   */
  async extract(
    businessId: string,
    scannerType: ScannerType,
    fileBuffer: Buffer,
    mediaType: DigitizerMediaType,
  ): Promise<DigitizerRow[]> {
    return (
      await this.extractDocument(businessId, scannerType, fileBuffer, mediaType)
    ).rows;
  }

  async extractDocument(
    businessId: string,
    scannerType: ScannerType,
    fileBuffer: Buffer,
    mediaType: DigitizerMediaType,
    pageCount = 1,
  ): Promise<ExtractionResult> {
    const defaultDestination = DEFAULT_DESTINATION_BY_SCANNER_TYPE[scannerType];
    const prompt = this.buildPrompt(scannerType, defaultDestination, pageCount);

    const fileBlock: AnthropicContentBlock =
      mediaType === PDF_MIME_TYPE
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: fileBuffer.toString('base64'),
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: fileBuffer.toString('base64'),
            },
          };

    let raw: string;
    let truncated = false;
    try {
      const result = await this.aiInfra.createMessage(
        businessId,
        'digitizer_scan',
        {
          model: DIGITIZER_MODEL,
          temperature: 0,
          maxTokens: 16000,
          messages: [
            {
              role: 'user',
              content: [fileBlock, { type: 'text', text: prompt }],
            },
          ],
        },
      );
      raw = result.content.find((block) => block.type === 'text')?.text ?? '';
      truncated = result.stopReason === 'max_tokens';
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

    if (truncated) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.EXTRACTION_UNAVAILABLE,
        'This document has more content than can be read in one pass — split it into fewer pages and try again.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const parsed = this.parse(raw, scannerType, defaultDestination);
    const aliasMap = await this.aliases.getMap(businessId);
    return {
      analysis: parsed.analysis,
      rows: parsed.rows.map((row) => this.applyAliasesToRow(row, aliasMap)),
    };
  }

  private buildPrompt(
    scannerType: ScannerType,
    defaultDestination: DigitizerDestination | null,
    pageCount: number,
  ): string {
    return [
      `You are reading a photographed or scanned business document (${pageCount} page${pageCount === 1 ? '' : 's'}) for a small-business app. The owner says it is: ${scannerType.replace('_', ' ')}. Trust the document over the owner if they clearly disagree.`,
      'Return ONLY one JSON object — no markdown fences, no prose — shaped exactly like:',
      JSON.stringify({
        document: {
          type: DOCUMENT_KINDS.join(' | '),
          typeConfidence: '0-1',
          title:
            'short human title such as "Supplier invoice · Zenith Beauty" (max 60 chars) or null',
          handwriting: 'printed | handwritten | mixed',
          language: 'e.g. "English" or "Urdu and English"',
          quality: {
            legible: 'boolean — could the text be read at all',
            blur: 'none | mild | severe',
            glare: 'none | mild | severe',
            shadow: 'none | mild | severe',
            skew: 'none | mild | severe (perspective / tilt)',
            cutOff: 'boolean — is text cut off at the page edge',
            notes: 'string | null',
          },
          invoiceNumber: 'string | null',
          supplier: 'string | null',
          documentDate: '"YYYY-MM-DD" | null',
          currency: 'ISO code if printed, else null',
          lineItems:
            '[{"description","quantity","unitPrice","lineTotal","page","row"}] — invoices and receipts only, else []',
          totals:
            '{"subtotal","tax","discount","printedTotal"} exactly as printed, else null',
          ledger:
            '{"openingBalance","entries":[{"description","amount","kind":"charge|payment"}],"statedClosingBalance"} — credit ledgers only, else null',
        },
        rows: [
          {
            destination: DESTINATIONS.join(' | '),
            data: '{...fields for that destination}',
            fieldConfidence: '{"<field>": 0-1 or null}',
            confidence: '0-1 for the whole row',
            page: 'page number the row is on',
            row: 'the row number as printed/counted on that page',
            region:
              '{"x","y","w","h"} — approximate box of the row as fractions (0-1) of the page width/height',
          },
        ],
      }),
      'Field shapes per destination:',
      DESTINATION_FIELD_GUIDE,
      'Per-type row rules:',
      [
        '- customer_list / customer: one "customer" row per person.',
        '- invoice / receipt: exactly ONE "expense" row for the whole document (description "<supplier> · <invoice number>", amount = the printed total, incurredOn = the document date). Put every line in document.lineItems, not in rows.',
        '- register tape: each entry is its own "expense" row.',
        '- credit ledger: one "credit_opening_balance" row per customer with the amount currently owed; also fill document.ledger.',
        '- inventory sheet: one "inventory" row per product.',
        '- product list / menu: one "product" row per item.',
        '- business card: one "supplier" row.',
        '- booking registers and staff registers cannot be imported: classify them and return "rows": [].',
      ].join('\n'),
      defaultDestination
        ? `Every row here is almost certainly "${defaultDestination}" — only use another destination if the document clearly contains something else.`
        : 'This document may contain a mix of record types — pick the correct destination per row.',
      'Honesty rules — these matter more than completeness:',
      [
        '- Copy every value exactly as written. Never invent, complete, correct, or "tidy" a value.',
        '- If a field is on the document but you cannot read it, set it to null AND set its fieldConfidence to null. If a field is simply not on the document, omit the key.',
        '- Never adjust any figure so that totals add up. Record line items and totals exactly as printed, even when they disagree.',
        '- Money as plain numbers (no currency symbol, no thousands separators). Dates as YYYY-MM-DD only when the whole date is clear, otherwise null.',
        '- Phone numbers exactly as written (do not add a country code).',
        '- Lower fieldConfidence for smudged, ambiguous or partly cut-off values; do not report high confidence you do not have.',
        '- Do not invent a row that is not really in the document.',
      ].join('\n'),
    ].join('\n\n');
  }

  private parse(
    raw: string,
    scannerType: ScannerType,
    defaultDestination: DigitizerDestination | null,
  ): ExtractionResult {
    let parsed: unknown;
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}');
    const arrStart = raw.indexOf('[');
    const arrEnd = raw.lastIndexOf(']');
    try {
      if (
        objStart !== -1 &&
        objEnd > objStart &&
        (arrStart === -1 || objStart < arrStart)
      ) {
        parsed = JSON.parse(raw.slice(objStart, objEnd + 1));
      } else if (arrStart !== -1 && arrEnd > arrStart) {
        parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
      }
    } catch {
      parsed = undefined;
    }

    if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
      throw new AppException(
        DIGITIZER_ERROR_CODES.EXTRACTION_UNAVAILABLE,
        'The scan could not be interpreted. Try a clearer photo.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Earlier prompts returned a bare array of rows — still accepted.
    const obj: RawObject = Array.isArray(parsed)
      ? { rows: parsed }
      : (parsed as RawObject);
    const rawRows = Array.isArray(obj.rows) ? (obj.rows as RawObject[]) : [];
    const doc = (
      obj.document && typeof obj.document === 'object' ? obj.document : {}
    ) as RawObject;

    const rows: DigitizerRow[] = [];
    for (const item of rawRows) {
      const row = this.parseRow(item, defaultDestination);
      if (row) rows.push(row);
    }

    const kind = this.asKind(doc.type) ?? KIND_BY_SCANNER_TYPE[scannerType];
    return {
      analysis: {
        documentKind: kind,
        typeConfidence: this.asUnit(doc.typeConfidence),
        title: this.asText(doc.title, 80),
        handwriting: this.asOneOf(doc.handwriting, [
          'printed',
          'handwritten',
          'mixed',
        ]),
        language: this.asText(doc.language, 60),
        quality: this.parseQuality(doc.quality),
        invoiceNumber: this.asText(doc.invoiceNumber, 60),
        supplier: this.asText(doc.supplier, 120),
        documentDate: this.asIsoDate(doc.documentDate),
        currency: this.asText(doc.currency, 8),
        lineItems: this.parseLineItems(doc.lineItems),
        totals: this.parseTotals(doc.totals),
        ledger: this.parseLedger(doc.ledger),
        extractionModel: DIGITIZER_MODEL,
      },
      rows,
    };
  }

  private parseRow(
    item: RawObject,
    fallback: DigitizerDestination | null,
  ): DigitizerRow | null {
    const destination = this.resolveDestination(item.destination, fallback);
    if (
      !destination ||
      !item.data ||
      typeof item.data !== 'object' ||
      Array.isArray(item.data)
    )
      return null;

    const data: DigitizerRowData = {};
    for (const [k, v] of Object.entries(item.data as RawObject)) {
      if (v === null || typeof v === 'string' || typeof v === 'number')
        data[k] = v;
      else if (typeof v === 'boolean') data[k] = String(v);
    }
    if (Object.keys(data).length === 0) return null;

    const fieldConfidence: Record<string, number | null> = {};
    if (item.fieldConfidence && typeof item.fieldConfidence === 'object') {
      for (const [k, v] of Object.entries(item.fieldConfidence as RawObject)) {
        if (v === null) fieldConfidence[k] = null;
        else if (typeof v === 'number')
          fieldConfidence[k] = Math.min(1, Math.max(0, v));
      }
    }

    const page = this.asPositiveInt(item.page);
    const sourceRow = this.asPositiveInt(item.row);
    const region = this.parseRegion(item.region);

    return {
      id: randomUUID(),
      destination,
      data,
      original: { ...data },
      confidence:
        typeof item.confidence === 'number'
          ? Math.min(1, Math.max(0, item.confidence))
          : 0,
      ...(Object.keys(fieldConfidence).length ? { fieldConfidence } : {}),
      ...(page !== null ? { page } : {}),
      ...(sourceRow !== null ? { sourceRow } : {}),
      ...(region ? { region } : {}),
      corrected: false,
      reviewed: false,
      action: 'commit',
    };
  }

  private resolveDestination(
    value: unknown,
    fallback: DigitizerDestination | null,
  ): DigitizerDestination | null {
    if (
      typeof value === 'string' &&
      (DESTINATIONS as readonly string[]).includes(value)
    ) {
      return value as DigitizerDestination;
    }
    return fallback;
  }

  private parseQuality(v: unknown): QualityAssessment | null {
    if (!v || typeof v !== 'object') return null;
    const q = v as RawObject;
    const level = (x: unknown): Legibility | null =>
      this.asOneOf(x, ['none', 'mild', 'severe']);
    return {
      legible: typeof q.legible === 'boolean' ? q.legible : null,
      blur: level(q.blur),
      glare: level(q.glare),
      shadow: level(q.shadow),
      skew: level(q.skew),
      cutOff: typeof q.cutOff === 'boolean' ? q.cutOff : null,
      notes: this.asText(q.notes, 300),
    };
  }

  private parseLineItems(v: unknown): LineItem[] {
    if (!Array.isArray(v)) return [];
    return (v as RawObject[])
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        description: this.asText(x.description, 200),
        quantity: this.asNumber(x.quantity),
        unitPrice: this.asNumber(x.unitPrice),
        lineTotal: this.asNumber(x.lineTotal),
        ...(this.asPositiveInt(x.page) !== null
          ? { page: this.asPositiveInt(x.page)! }
          : {}),
        ...(this.asPositiveInt(x.row) !== null
          ? { row: this.asPositiveInt(x.row)! }
          : {}),
      }))
      .slice(0, 500);
  }

  private parseTotals(v: unknown): ExtractionResult['analysis']['totals'] {
    if (!v || typeof v !== 'object') return null;
    const t = v as RawObject;
    const totals = {
      subtotal: this.asNumber(t.subtotal),
      tax: this.asNumber(t.tax),
      discount: this.asNumber(t.discount),
      printedTotal: this.asNumber(t.printedTotal),
    };
    return Object.values(totals).every((x) => x === null) ? null : totals;
  }

  private parseLedger(v: unknown): LedgerData | null {
    if (!v || typeof v !== 'object') return null;
    const l = v as RawObject;
    const entries = Array.isArray(l.entries)
      ? (l.entries as RawObject[])
          .filter((e) => e && typeof e === 'object')
          .map((e) => ({
            description: this.asText(e.description, 200),
            amount: this.asNumber(e.amount),
            kind:
              e.kind === 'payment' ? ('payment' as const) : ('charge' as const),
          }))
          .slice(0, 1000)
      : [];
    const ledger: LedgerData = {
      openingBalance: this.asNumber(l.openingBalance),
      entries,
      statedClosingBalance: this.asNumber(l.statedClosingBalance),
    };
    return entries.length === 0 && ledger.statedClosingBalance === null
      ? null
      : ledger;
  }

  private parseRegion(v: unknown): FieldRegion | null {
    if (!v || typeof v !== 'object') return null;
    const r = v as RawObject;
    const [x, y, w, h] = [r.x, r.y, r.w, r.h].map((n) =>
      typeof n === 'number' && Number.isFinite(n) ? n : NaN,
    );
    if ([x, y, w, h].some(Number.isNaN)) return null;
    const cx = Math.min(1, Math.max(0, x));
    const cy = Math.min(1, Math.max(0, y));
    const cw = Math.min(1 - cx, Math.max(0, w));
    const ch = Math.min(1 - cy, Math.max(0, h));
    return cw > 0 && ch > 0 ? { x: cx, y: cy, w: cw, h: ch } : null;
  }

  private asKind(v: unknown): DocumentKind | null {
    return typeof v === 'string' &&
      (DOCUMENT_KINDS as readonly string[]).includes(v)
      ? (v as DocumentKind)
      : null;
  }

  private asOneOf<T extends string>(
    v: unknown,
    allowed: readonly T[],
  ): T | null {
    return typeof v === 'string' && (allowed as readonly string[]).includes(v)
      ? (v as T)
      : null;
  }

  private asText(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  }

  private asNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''));
      return v.trim() !== '' && Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private asUnit(v: unknown): number | null {
    const n = this.asNumber(v);
    return n === null ? null : Math.min(1, Math.max(0, n));
  }

  private asPositiveInt(v: unknown): number | null {
    const n = this.asNumber(v);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  }

  private asIsoDate(v: unknown): string | null {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())
      ? v.trim()
      : null;
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
