import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  DigitizerLookupService,
  LookupFlags,
  LookupInput,
} from './digitizer-lookup.service';
import { PhotoBatch, readAnalysis, readRows } from './digitizer-document';
import {
  DocumentAssessment,
  RowLookup,
  RulesContext,
  assessDocument,
} from './digitizer-rules';
import { DigitizerAnalysis } from './digitizer.types';

export interface AssessedBatch {
  batch: PhotoBatch;
  analysis: DigitizerAnalysis;
  assessment: DocumentAssessment;
}

export interface BusinessRules {
  ctx: RulesContext;
  flags: LookupFlags;
  rejectUnreadable: boolean;
  country: string | null;
  currency: string;
}

/**
 * Turns stored batches into the assessed documents every screen reads. Nothing is cached in the
 * database: validation, confidence levels, duplicates and status are recomputed from the rows and
 * the business's current rules each time, so a correction or a changed setting is reflected at once.
 */
@Injectable()
export class DigitizerAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: DigitizerLookupService,
  ) {}

  async rulesFor(businessId: string): Promise<BusinessRules> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { country: true, currency: true, policies: true },
    });
    const p = resolvePolicies(business);
    return {
      ctx: {
        country: business.country,
        currency: business.currency,
        reviewThreshold: p.num('digitizer.reviewThreshold') ?? 0.7,
        now: new Date(),
      },
      flags: {
        matchOnPhone: p.bool('digitizer.matchOnPhone'),
        matchOnEmail: p.bool('digitizer.matchOnEmail'),
        flagNameOnlyMatch: p.bool('digitizer.flagNameOnlyMatch'),
      },
      rejectUnreadable: p.bool('digitizer.rejectUnreadable'),
      country: business.country,
      currency: business.currency,
    };
  }

  /** Assesses many documents with one lookup per table (not one per document). */
  async assessMany(
    businessId: string,
    batches: PhotoBatch[],
    rules?: BusinessRules,
  ): Promise<AssessedBatch[]> {
    const r = rules ?? (await this.rulesFor(businessId));

    const inputs: LookupInput[] = [];
    for (const b of batches) {
      if (
        b.status === 'processing' ||
        b.status === 'failed' ||
        b.status === 'completed'
      )
        continue;
      for (const row of readRows(b)) inputs.push({ docId: b.id, row });
    }
    const lookups: Map<string, RowLookup> = inputs.length
      ? await this.lookup.lookup(businessId, r.country, r.flags, inputs)
      : new Map<string, RowLookup>();

    return batches.map((batch) => {
      const analysis = readAnalysis(batch);
      const assessment = assessDocument(
        {
          batchStatus: batch.status,
          stage: batch.stage,
          rows: readRows(batch),
          analysis,
        },
        r.ctx,
        lookups,
      );
      return { batch, analysis, assessment };
    });
  }

  async assessOne(
    businessId: string,
    batch: PhotoBatch,
    rules?: BusinessRules,
  ): Promise<AssessedBatch> {
    return (await this.assessMany(businessId, [batch], rules))[0];
  }
}
