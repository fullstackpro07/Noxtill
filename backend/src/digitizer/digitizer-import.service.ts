import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma, StockMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { DigitizerAssessmentService } from './digitizer-assessment.service';
import { DigitizerViewService } from './digitizer-view.service';
import {
  PhotoBatch,
  appendEvent,
  asJson,
  readJobs,
  readRows,
} from './digitizer-document';
import { AssessedRow, parseAmount, parseIsoDate } from './digitizer-rules';
import { DIGITIZER_ERROR_CODES } from './digitizer.constants';
import { DocumentDetail } from './digitizer.api-types';
import {
  DigitizerDestination,
  DigitizerRow,
  DigitizerRowResult,
  ImportJob,
} from './digitizer.types';
import { countCommit } from './digitizer-pipeline.service';

const IMPORT_NOTE = 'Imported via AI Photo Digitizer';

export interface CommitResult {
  job: ImportJob;
  document: DocumentDetail;
}

type Tx = Prisma.TransactionClient;

/** The string a row's field will actually be written as — the normalized value, never the raw one. */
function value(row: AssessedRow, field: string): string | null {
  return row.fields.find((f) => f.field === field)?.normalized ?? null;
}

/**
 * The only step in the Digitizer that writes to other modules. It writes exactly the rows the
 * import preview promised — ready rows only — records what happened to every one of them on the
 * row itself, and never re-imports a row that already succeeded, so a partial import can be
 * retried safely.
 */
@Injectable()
export class DigitizerImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessment: DigitizerAssessmentService,
    private readonly view: DigitizerViewService,
  ) {}

  async commit(
    businessId: string,
    actorId: string | null,
    batchId: string,
  ): Promise<CommitResult> {
    const batch = (await this.prisma.importBatch.findFirst({
      where: { id: batchId, businessId, source: 'photo' },
    })) as unknown as PhotoBatch | null;
    if (!batch) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.UNKNOWN_BATCH,
        'Digitizer scan not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (batch.status === ImportStatus.completed) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ALREADY_COMMITTED,
        'This scan has already been imported',
        HttpStatus.CONFLICT,
      );
    }
    if (
      batch.status === ImportStatus.processing ||
      batch.status === ImportStatus.failed
    ) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.STILL_PROCESSING,
        'This document has not finished being read, so there is nothing to import.',
        HttpStatus.CONFLICT,
      );
    }

    // A second click, or a second tab, must not import the same rows twice.
    const claimed = await this.prisma.importBatch.updateMany({
      where: { id: batch.id, status: ImportStatus.pending, stage: null },
      data: { stage: 'importing' },
    });
    if (claimed.count === 0) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.STILL_PROCESSING,
        'An import of this document is already running.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      return await this.run(businessId, actorId, batch);
    } finally {
      await this.prisma.importBatch.updateMany({
        where: { id: batch.id, stage: 'importing' },
        data: { stage: null },
      });
    }
  }

  private async run(
    businessId: string,
    actorId: string | null,
    batch: PhotoBatch,
  ): Promise<CommitResult> {
    const rules = await this.assessment.rulesFor(businessId);
    const assessed = await this.assessment.assessOne(businessId, batch, rules);
    const todo = assessed.assessment.rows.filter(
      (r) =>
        r.action === 'commit' &&
        (r.state === 'ready' || r.state === 'failed') &&
        r.plan !== 'blocked' &&
        r.plan !== 'done',
    );
    const blocked = assessed.assessment.rows.filter(
      (r) => r.state === 'blocked' || r.state === 'needs_review',
    ).length;

    if (todo.length === 0) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.NOTHING_TO_IMPORT,
        blocked > 0
          ? 'Every remaining row is blocked — resolve them in Review before importing.'
          : 'There is nothing left to import in this document.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const jobId = `IMP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const at = new Date().toISOString();
    const results = new Map<string, DigitizerRowResult>();
    const destinations = new Set<DigitizerDestination>();

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of todo) {
          destinations.add(row.destination);
          try {
            const outcome = await this.commitRow(tx, businessId, batch, row);
            results.set(row.id, { ...outcome, at, jobId });
          } catch (error) {
            results.set(row.id, {
              status: 'failed',
              error: (error as Error).message.slice(0, 300),
              at,
              jobId,
            });
          }
        }
      },
      { timeout: 120_000, maxWait: 15_000 },
    );

    const stored = readRows(batch);
    const nextRows: DigitizerRow[] = stored.map((r) => {
      const res = results.get(r.id);
      return res ? { ...r, result: res } : r;
    });

    const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const failures: ImportJob['failures'] = [];
    for (const [rowId, res] of results) {
      if (res.status === 'created') tally.created += 1;
      else if (res.status === 'updated') tally.updated += 1;
      else if (res.status === 'skipped') tally.skipped += 1;
      else {
        tally.failed += 1;
        failures.push({ rowId, reason: res.error ?? 'Failed' });
      }
    }

    const job: ImportJob = {
      id: jobId,
      at,
      byId: actorId,
      ...tally,
      blocked,
      destinations: [...destinations],
      failures,
    };

    // The document is finished once every row that was going to import has either imported or been skipped.
    const settled = nextRows.every(
      (r) => r.action === 'skip' || (r.result && r.result.status !== 'failed'),
    );

    const jobs = [...readJobs(batch), job];
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        rows: asJson(nextRows),
        counts: asJson(countCommit(nextRows)),
        importResult: asJson({ jobs }),
        status: settled ? ImportStatus.completed : ImportStatus.pending,
        events: appendEvent(
          batch,
          actorId,
          'imported',
          `${jobId}: ${tally.created} created, ${tally.updated} updated, ${tally.skipped} skipped, ${tally.failed} failed${blocked ? ` · ${blocked} left in review` : ''}`,
        ),
      },
    });

    const fresh = (await this.prisma.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
    })) as unknown as PhotoBatch;
    const document = await this.view.toDetail(
      await this.assessment.assessOne(businessId, fresh, rules),
      rules,
    );
    return { job, document };
  }

  private async commitRow(
    tx: Tx,
    businessId: string,
    batch: PhotoBatch,
    row: AssessedRow,
  ): Promise<Omit<DigitizerRowResult, 'at' | 'jobId'>> {
    const num = (field: string) => {
      const v = value(row, field);
      return v === null ? null : parseAmount(v);
    };
    const useExisting = row.duplicateDecision === 'use_existing';

    switch (row.destination) {
      case 'customer': {
        const phone = value(row, 'phone');
        const name = value(row, 'name');
        if (!phone || !name) throw new Error('Missing name or phone');
        if (useExisting && row.duplicate) {
          // The owner said this person already exists (matched on phone, email or name) — never create a second one.
          const ref = row.duplicate.existing.id;
          if (ref.startsWith('row:')) return { status: 'skipped' };
          const balance = num('balance') ?? 0;
          if (balance > 0) {
            await tx.creditEntry.create({
              data: {
                businessId,
                customerId: ref,
                kind: 'credit',
                amount: balance,
                note: `Opening balance — ${IMPORT_NOTE}`,
              },
            });
            return { status: 'updated', recordId: ref };
          }
          return { status: 'skipped', recordId: ref };
        }
        const existing = await tx.customer.findUnique({
          where: { businessId_phone: { businessId, phone } },
        });
        // Phone numbers are unique per business, so a matching phone is always "use the existing customer".
        const customer =
          existing ??
          (await tx.customer.create({
            data: {
              businessId,
              phone,
              name,
              email: value(row, 'email') ?? undefined,
              address: value(row, 'address') ?? undefined,
              notes: value(row, 'notes') ?? undefined,
              // A scanned contact never opted in themselves, so this must never default to the schema's `true`.
              consentMarketing: false,
            },
          }));
        const balance = num('balance') ?? 0;
        if (balance > 0) {
          await tx.creditEntry.create({
            data: {
              businessId,
              customerId: customer.id,
              kind: 'credit',
              amount: balance,
              note: `Opening balance — ${IMPORT_NOTE}`,
            },
          });
          return {
            status: existing ? 'updated' : 'created',
            recordId: customer.id,
          };
        }
        return existing
          ? { status: 'skipped', recordId: customer.id }
          : { status: 'created', recordId: customer.id };
      }

      case 'credit_opening_balance': {
        const phone = value(row, 'phone');
        const name = value(row, 'customerName');
        const amount = num('amount');
        if (!phone || !name) throw new Error('Missing customer name or phone');
        if (amount === null || !(amount > 0))
          throw new Error('Missing or invalid amount');
        const existing = await tx.customer.findUnique({
          where: { businessId_phone: { businessId, phone } },
        });
        const customer =
          existing ??
          (await tx.customer.create({
            data: { businessId, phone, name, consentMarketing: false },
          }));
        await tx.creditEntry.create({
          data: {
            businessId,
            customerId: customer.id,
            kind: 'credit',
            amount,
            note: `Opening balance — ${IMPORT_NOTE}`,
          },
        });
        return {
          status: existing ? 'updated' : 'created',
          recordId: customer.id,
        };
      }

      case 'product': {
        if (row.plan === 'skip' || (useExisting && row.duplicate)) {
          return { status: 'skipped', recordId: row.duplicate?.existing.id };
        }
        const name = value(row, 'name');
        if (!name) throw new Error('Missing product name');
        const product = await tx.product.create({
          data: {
            businessId,
            kind: 'product',
            name,
            sku: value(row, 'sku') ?? undefined,
            category: value(row, 'category') ?? undefined,
            costPrice: num('costPrice') ?? 0,
            sellingPrice: num('sellingPrice') ?? 0,
            stockQty: Math.trunc(num('stockQty') ?? 0),
          },
        });
        return { status: 'created', recordId: product.id };
      }

      case 'expense': {
        if (row.plan === 'skip' || (useExisting && row.duplicate)) {
          return { status: 'skipped', recordId: row.duplicate?.existing.id };
        }
        const description = value(row, 'description');
        const amount = num('amount');
        const day = parseIsoDate(value(row, 'incurredOn'));
        if (!description || amount === null || !(amount > 0))
          throw new Error('Missing description or amount');
        if (!day) throw new Error('Missing date');
        const expense = await tx.expense.create({
          data: {
            businessId,
            description,
            amount,
            category: value(row, 'category') ?? 'Uncategorized',
            incurredOn: day,
            /// UPD-BE-107: every expense committed via this pipeline came from a real scanned
            /// photo — link back to it so the owner can view the original receipt later.
            receiptKey: batch.imageKey,
          },
        });
        return { status: 'created', recordId: expense.id };
      }

      case 'supplier': {
        if (row.plan === 'skip' || (useExisting && row.duplicate)) {
          return { status: 'skipped', recordId: row.duplicate?.existing.id };
        }
        const name = value(row, 'name');
        if (!name) throw new Error('Missing supplier name');
        const supplier = await tx.supplier.create({
          data: {
            businessId,
            name,
            phone: value(row, 'phone') ?? undefined,
            email: value(row, 'email') ?? undefined,
            address: value(row, 'address') ?? undefined,
          },
        });
        return { status: 'created', recordId: supplier.id };
      }

      case 'inventory': {
        const counted = num('countedQty');
        if (counted === null || !Number.isInteger(counted) || counted < 0)
          throw new Error('Missing or invalid counted quantity');
        // Re-resolved inside the transaction: the catalog may have changed since the preview.
        const sku = value(row, 'sku');
        const name = value(row, 'name');
        const product =
          (sku
            ? await tx.product.findFirst({
                where: { businessId, kind: 'product', sku },
              })
            : null) ??
          (name
            ? await tx.product.findFirst({
                where: { businessId, kind: 'product', name },
              })
            : null);
        if (!product)
          throw new Error('No product in your catalog matches this row');
        if (product.stockQty === counted)
          return { status: 'skipped', recordId: product.id };

        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: counted },
        });
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: product.id,
            kind: StockMovementKind.adjustment,
            qty: counted - product.stockQty,
            reason: `Stock count from scan ${batch.id}: ${product.stockQty} -> ${counted}`,
          },
        });
        return { status: 'updated', recordId: product.id };
      }
    }
  }
}
