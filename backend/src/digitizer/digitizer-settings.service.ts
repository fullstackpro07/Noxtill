import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PoliciesService } from '../common/policies/policies.service';
import {
  POLICY_DEFS,
  PolicyDef,
  PolicyKey,
  isPolicyKey,
} from '../common/policies/policies.constants';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { DigitizerAliasService } from './digitizer-alias.service';
import {
  DIGITIZER_MODEL,
  HIGH_CONFIDENCE,
  MAX_IMAGE_SIZE_BYTES,
  MAX_PDF_PAGES,
  MAX_PDF_SIZE_BYTES,
} from './digitizer.constants';
import { SettingItem, SettingsResponse } from './digitizer.api-types';

const MB = 1024 * 1024;

/** Only these policies are editable from the Digitizer screen — each has a real consumer (see policies.constants.ts). */
export const DIGITIZER_POLICY_KEYS = [
  'digitizer.reviewThreshold',
  'digitizer.matchOnPhone',
  'digitizer.matchOnEmail',
  'digitizer.flagNameOnlyMatch',
  'digitizer.rejectUnreadable',
] as const satisfies readonly PolicyKey[];

/**
 * Digitizer settings, honestly: a row is either a real owner policy the pipeline reads (editable),
 * or a fact about how the module behaves (read-only). There are no on/off switches for things that
 * are not built — deskew, auto-crop and noise reduction do not exist, so they are said not to.
 */
@Injectable()
export class DigitizerSettingsService {
  constructor(
    private readonly policies: PoliciesService,
    private readonly s3: S3Service,
    private readonly aliases: DigitizerAliasService,
  ) {}

  async get(businessId: string): Promise<SettingsResponse> {
    const p = await this.policies.forBusiness(businessId);
    const threshold = p.num('digitizer.reviewThreshold') ?? 0.7;

    const toggle = (
      key: (typeof DIGITIZER_POLICY_KEYS)[number],
      label: string,
      meta: string,
      onText: string,
      offText: string,
      offTone: SettingItem['tone'] = 'amber',
    ): SettingItem => {
      const on = p.bool(key);
      return {
        key,
        label,
        meta,
        control: 'toggle',
        on,
        value: on ? onText : offText,
        tone: on ? 'green' : offTone,
        policy: key,
      };
    };
    const fact = (
      key: string,
      label: string,
      meta: string,
      value: string,
      tone: SettingItem['tone'] = 'neutral',
    ): SettingItem => ({ key, label, meta, control: 'fact', value, tone });

    const storage =
      this.s3.storageMode() === 's3'
        ? 'Object storage (S3)'
        : 'Local disk (development)';
    const list = await this.aliases.list(businessId);

    return {
      groups: [
        {
          title: 'Processing',
          icon: 'scan-text',
          items: [
            fact(
              'model',
              'Extraction model',
              'Reads printed text, handwriting and tables in a single pass',
              DIGITIZER_MODEL,
              'blue',
            ),
            fact(
              'formats',
              'Accepted formats',
              'HEIC and Office documents are not supported',
              'JPG · PNG · WEBP · PDF',
              'green',
            ),
            fact(
              'limits',
              'Size and page limits',
              'A larger file is refused with the reason',
              `${MAX_IMAGE_SIZE_BYTES / MB} MB image · ${MAX_PDF_SIZE_BYTES / MB} MB PDF · ${MAX_PDF_PAGES} pages`,
            ),
            fact(
              'classification',
              'Document type',
              'The model names the type and how sure it is; you can re-run as another type',
              'Automatic · overridable',
              'green',
            ),
            fact(
              'handwriting',
              'Handwriting',
              'Each document records whether it read as printed, handwritten or mixed',
              'Reported per document',
              'green',
            ),
          ],
        },
        {
          title: 'Image quality',
          icon: 'crop',
          items: [
            fact(
              'precheck',
              'Checks before upload',
              'Blur, glare, lighting and resolution are measured from the photo’s pixels in your browser',
              'Blur · glare · lighting · resolution',
              'green',
            ),
            toggle(
              'digitizer.rejectUnreadable',
              'Reject unreadable photos',
              'When the model says a photo cannot be read reliably, fail it with the reason instead of returning guesses',
              'On',
              'Off',
            ),
            fact(
              'enhance',
              'Enhancement (deskew, crop, noise reduction)',
              'The original is read exactly as uploaded — no derived copy is made',
              'Not available',
            ),
          ],
        },
        {
          title: 'Confidence',
          icon: 'gauge',
          items: [
            {
              key: 'digitizer.reviewThreshold',
              label: 'Review threshold',
              meta: 'A field or row below this must be checked before it can import',
              control: 'number',
              value: `${Math.round(threshold * 100)}%`,
              number: {
                value: threshold,
                min:
                  (POLICY_DEFS['digitizer.reviewThreshold'] as PolicyDef).min ??
                  0.3,
                max:
                  (POLICY_DEFS['digitizer.reviewThreshold'] as PolicyDef).max ??
                  0.95,
                step: 0.05,
              },
              policy: 'digitizer.reviewThreshold',
              tone: 'neutral',
            },
            fact(
              'high',
              'High confidence from',
              'Above this a field reads as high; between the threshold and this it reads as medium',
              `${Math.round(HIGH_CONFIDENCE * 100)}%`,
            ),
            fact(
              'low',
              'Low-confidence handling',
              'A flagged field stays flagged until you accept or correct it',
              'Flag for review',
              'green',
            ),
            fact(
              'unreadable',
              'Unreadable handling',
              'The model is instructed to leave what it cannot read blank rather than guess',
              'Left blank',
              'green',
            ),
          ],
        },
        {
          title: 'Duplicates',
          icon: 'copy-check',
          items: [
            toggle(
              'digitizer.matchOnPhone',
              'Match on phone',
              'A strong identifier — the same number as an existing record',
              'On',
              'Off',
            ),
            toggle(
              'digitizer.matchOnEmail',
              'Match on email',
              'A strong identifier — the same address as an existing record',
              'On',
              'Off',
            ),
            toggle(
              'digitizer.flagNameOnlyMatch',
              'Flag name-only matches',
              'Weak evidence — flagged for your attention but never blocks or merges',
              'Flag',
              'Ignore',
              'neutral',
            ),
            fact(
              'merge',
              'Auto-merge',
              'Two records are never combined without your decision',
              'Never',
              'amber',
            ),
          ],
        },
        {
          title: 'Import',
          icon: 'file-input',
          items: [
            fact(
              'destination',
              'Default destination',
              'Suggested from the document type; you can change it per row',
              'By document type',
            ),
            fact(
              'dup-policy',
              'On a duplicate',
              'The row is held until you choose to use the existing record or create a new one',
              'Ask per record',
              'amber',
            ),
            fact(
              'missing',
              'On a missing required value',
              'Only that row is blocked; the rest of the document can import',
              'Block the row',
            ),
            fact(
              'high-risk',
              'High-risk destinations',
              'A credit ledger that does not reconcile blocks every credit row',
              'Whole ledger blocked',
              'amber',
            ),
            fact(
              'consent',
              'Marketing consent',
              'A scanned contact never opted in themselves',
              'Never opted in',
              'green',
            ),
            fact(
              'rollback',
              'Rollback',
              'Imported records are ordinary records — undo them in their own module',
              'Not available',
            ),
          ],
        },
        {
          title: 'Storage and privacy',
          icon: 'lock-keyhole',
          items: [
            fact(
              'storage',
              'Where originals live',
              'The uploaded file is stored as-is',
              storage,
            ),
            fact(
              'retention',
              'Original and extracted data',
              'Nothing is deleted automatically — delete a document to remove both',
              'Kept until you delete them',
            ),
            fact(
              'access',
              'Who can open documents',
              'Anyone signed in to this business with Digitizer access',
              'Team members',
            ),
          ],
        },
      ],
      principles: [
        'Nothing is written to any module until you confirm an import.',
        'Arithmetic is never adjusted — a total that does not reconcile is reported, not fixed.',
        'Two records are never merged automatically.',
        'The original file is stored exactly as uploaded and is never modified or replaced.',
        'The model is told to leave unreadable fields blank; low-confidence values stay flagged until you accept them.',
        'No rollback is offered — imported records live in their own modules and are undone there.',
      ],
      aliases: list.map((a) => ({
        id: a.id,
        rawText: a.rawText,
        correctedText: a.correctedText,
        updatedAt: a.updatedAt.toISOString(),
      })),
    };
  }

  async set(businessId: string, key: string, value: unknown) {
    if (
      !isPolicyKey(key) ||
      !(DIGITIZER_POLICY_KEYS as readonly string[]).includes(key)
    ) {
      throw new AppException(
        'POLICY_UNKNOWN',
        `Unknown Digitizer setting: ${key}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (this.policies.actorRole() !== Role.owner) {
      throw new AppException(
        'SETTING_OWNER_ONLY',
        'Only the owner can change Digitizer settings.',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.policies.set(businessId, key, value);
    return this.get(businessId);
  }
}
