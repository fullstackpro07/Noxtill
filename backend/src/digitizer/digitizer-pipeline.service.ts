import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ImportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import {
  DigitizerVisionService,
  DigitizerMediaType,
} from './digitizer-vision.service';
import { DigitizerAssessmentService } from './digitizer-assessment.service';
import {
  PhotoBatch,
  appendEvent,
  asJson,
  readAnalysis,
} from './digitizer-document';
import {
  DIGITIZER_ERROR_CODES,
  STALE_PROCESSING_MS,
} from './digitizer.constants';
import { DOCUMENT_KIND_LABELS } from './digitizer-fields';
import {
  DigitizerAnalysis,
  DigitizerRow,
  DigitizerStage,
  StageTiming,
} from './digitizer.types';

const NO_IMPORTER_KINDS = new Set(['booking_register', 'staff_register']);

/**
 * The processing pipeline behind the Processing Queue. Every stage recorded here really ran:
 *
 *   queued → quality (file facts) → extraction (Claude reads the document) → validation (our rules
 *   run over what it read) → done
 *
 * A stage that fails names itself, and the reason is kept on the document. There is no progress
 * percentage anywhere because nothing here can honestly produce one.
 */
@Injectable()
export class DigitizerPipelineService {
  private readonly logger = new Logger(DigitizerPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly vision: DigitizerVisionService,
    private readonly assessment: DigitizerAssessmentService,
  ) {}

  /** Runs after the response is sent — the upload request never waits for the model. */
  schedule(batchId: string, buffer?: Buffer): void {
    setImmediate(() => {
      void this.run(batchId, buffer).catch((error: Error) =>
        this.logger.error(
          `Digitizer pipeline crashed for ${batchId}: ${error.message}`,
        ),
      );
    });
  }

  async run(batchId: string, buffer?: Buffer): Promise<void> {
    const batch = (await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    })) as PhotoBatch | null;
    if (!batch || batch.status !== ImportStatus.processing) return;

    const analysis = readAnalysis(batch);
    const stages: StageTiming[] = [];

    try {
      const bytes =
        buffer ??
        (batch.imageKey ? await this.s3.readObject(batch.imageKey) : null);
      if (!bytes) {
        throw new AppException(
          DIGITIZER_ERROR_CODES.ORIGINAL_UNAVAILABLE,
          'The original file is no longer available, so it cannot be read again.',
          HttpStatus.GONE,
        );
      }

      await this.enter(batch.id, 'quality', stages);
      // File facts (size, pixels, pages) were measured at upload; this stage records them as done.
      this.leave(stages);

      await this.enter(batch.id, 'extraction', stages);
      const extracted = await this.vision.extractDocument(
        batch.businessId,
        analysis.scannerType,
        bytes,
        (batch.mimeType ?? 'image/jpeg') as DigitizerMediaType,
        batch.pageCount ?? 1,
      );
      this.leave(stages);

      await this.enter(batch.id, 'validation', stages);
      const rules = await this.assessment.rulesFor(batch.businessId);
      const refusal = this.refusalReason(
        extracted.analysis,
        extracted.rows,
        rules.rejectUnreadable,
      );
      if (refusal)
        throw new AppException(
          'DIGITIZER_QUALITY_REFUSED',
          refusal,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );

      const nextAnalysis: DigitizerAnalysis = {
        ...analysis,
        ...extracted.analysis,
        dimensions: analysis.dimensions,
        scannerType: analysis.scannerType,
        stages: [],
      };
      this.leave(stages);
      nextAnalysis.stages = [
        ...stages,
        {
          stage: 'done',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      ];

      const provisional = await this.assessment.assessOne(
        batch.businessId,
        {
          ...batch,
          status: 'pending',
          stage: null,
          rows: extracted.rows,
          analysis: nextAnalysis,
        },
        rules,
      );

      const fresh = (await this.prisma.importBatch.findUniqueOrThrow({
        where: { id: batch.id },
      })) as PhotoBatch;
      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportStatus.pending,
          stage: null,
          stageStartedAt: null,
          failureReason: null,
          rows: asJson(extracted.rows),
          counts: asJson(countCommit(extracted.rows)),
          analysis: asJson(nextAnalysis),
          events: appendEvent(
            fresh,
            null,
            'extracted',
            `Read as ${DOCUMENT_KIND_LABELS[nextAnalysis.documentKind]}${nextAnalysis.typeConfidence !== null ? ` (${Math.round(nextAnalysis.typeConfidence * 100)}% sure)` : ''} — ${extracted.rows.length} record${extracted.rows.length === 1 ? '' : 's'}, ${provisional.assessment.issues.length} thing${provisional.assessment.issues.length === 1 ? '' : 's'} to check`,
          ),
        },
      });
    } catch (error) {
      await this.fail(batch, error, stages);
    }
  }

  /**
   * Refusing beats guessing: when the model says the photo is not legible (and the owner has not
   * turned that check off), or found nothing importable, the document fails with the reason kept.
   */
  private refusalReason(
    a: Pick<DigitizerAnalysis, 'quality' | 'documentKind'>,
    rows: DigitizerRow[],
    rejectUnreadable: boolean,
  ): string | null {
    if (rejectUnreadable && a.quality?.legible === false) {
      return `Quality check refused this photo — it is not legible enough to read reliably${a.quality.notes ? ` (${a.quality.notes})` : ''}. Retake it in better light and hold steady.`;
    }
    if (rows.length === 0) {
      if (NO_IMPORTER_KINDS.has(a.documentKind)) {
        return `This looks like a ${DOCUMENT_KIND_LABELS[a.documentKind].toLowerCase()}, which the digitizer cannot import yet. The original is kept.`;
      }
      return 'No records could be read from this document. The original is kept — try a clearer photo or choose a different document type.';
    }
    return null;
  }

  private async enter(
    batchId: string,
    stage: DigitizerStage,
    stages: StageTiming[],
  ): Promise<void> {
    const now = new Date();
    stages.push({ stage, startedAt: now.toISOString(), finishedAt: null });
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { stage, stageStartedAt: now },
    });
  }

  private leave(stages: StageTiming[]): void {
    const last = stages[stages.length - 1];
    if (last && !last.finishedAt) last.finishedAt = new Date().toISOString();
  }

  private async fail(
    batch: PhotoBatch,
    error: unknown,
    stages: StageTiming[],
  ): Promise<void> {
    const failedAt = stages[stages.length - 1];
    const message = this.reasonOf(error);
    this.logger.warn(
      `Digitizer document ${batch.id} failed at ${failedAt?.stage ?? 'start'}: ${message}`,
    );
    try {
      const fresh = (await this.prisma.importBatch.findUnique({
        where: { id: batch.id },
      })) as PhotoBatch | null;
      if (!fresh) return;
      const analysis = readAnalysis(fresh);
      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportStatus.failed,
          stage: null,
          stageStartedAt: null,
          failureReason: message.slice(0, 500),
          analysis: asJson({ ...analysis, stages }),
          events: appendEvent(
            fresh,
            null,
            'failed',
            `${failedAt ? `Stopped at ${failedAt.stage}: ` : ''}${message}`,
          ),
        },
      });
    } catch (inner) {
      this.logger.error(
        `Could not record failure for ${batch.id}: ${(inner as Error).message}`,
      );
    }
  }

  private reasonOf(error: unknown): string {
    if (error instanceof AppException) {
      const res = error.getResponse() as { message?: string };
      return typeof res === 'object' && res?.message
        ? String(res.message)
        : error.message;
    }
    return (error as Error)?.message ?? 'Unknown error';
  }

  /**
   * A batch still `processing` long after it started was interrupted (a restart, a crash) — it is
   * failed with an honest reason so it never sits in the queue forever.
   */
  async reapStale(businessId: string): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
    const stale = await this.prisma.importBatch.findMany({
      where: {
        businessId,
        source: 'photo',
        status: ImportStatus.processing,
        updatedAt: { lt: cutoff },
      },
    });
    for (const b of stale as unknown as PhotoBatch[]) {
      await this.prisma.importBatch.update({
        where: { id: b.id },
        data: {
          status: ImportStatus.failed,
          stage: null,
          stageStartedAt: null,
          failureReason:
            'Processing was interrupted before it finished. The original is kept — reprocess it to try again.',
          events: appendEvent(
            b,
            null,
            'failed',
            'Processing was interrupted before it finished',
          ),
        },
      });
    }
    return stale.length;
  }
}

export function countCommit(rows: DigitizerRow[]): Record<string, number> {
  const counts: Record<string, number> = {
    customer: 0,
    product: 0,
    expense: 0,
    supplier: 0,
    credit_opening_balance: 0,
    inventory: 0,
  };
  for (const row of rows)
    if (row.action === 'commit') counts[row.destination] += 1;
  return counts;
}
