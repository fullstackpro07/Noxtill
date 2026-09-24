import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCompetitorObservationDto } from './dto/create-competitor-observation.dto';

/**
 * Hand-recorded competitor observations (Competitive Insights) — prices, services and public
 * offers the owner saw on a competitor's own public pages. Nothing here is scraped or guessed:
 * Google Places and the Meta Ad Library expose none of it, so an owner's own note is the only
 * honest source. Rows are append-only (there is deliberately no update) — a price change is a new
 * row for the same label, so what a price used to be is never lost.
 */
@Injectable()
export class CompetitorObservationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Every observation, newest-observed first; optionally narrowed to one competitor. */
  async list(competitorId?: string) {
    const rows = await this.tenantPrisma.client.competitorObservation.findMany({
      where: competitorId ? { competitorId } : {},
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async create(businessId: string, dto: CreateCompetitorObservationDto) {
    // Tenant-scoped lookup — a competitor id from another business is simply "not found".
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id: dto.competitorId },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    const observedAt = dto.observedAt ? new Date(dto.observedAt) : new Date();
    if (observedAt.getTime() > Date.now() + 60_000) {
      throw new AppException(
        'COMPETITOR_OBSERVATION_IN_FUTURE',
        'An observation cannot be dated in the future',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.kind === 'price' && dto.amount == null) {
      throw new AppException(
        'COMPETITOR_OBSERVATION_PRICE_REQUIRED',
        'A price observation needs an amount',
        HttpStatus.BAD_REQUEST,
      );
    }

    const created = await this.tenantPrisma.client.competitorObservation.create(
      {
        data: {
          businessId,
          competitorId: dto.competitorId,
          kind: dto.kind,
          label: dto.label.trim(),
          amount: dto.amount ?? null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          source: dto.source?.trim() || null,
          observedAt,
        },
      },
    );
    return this.serialize(created);
  }

  async remove(id: string) {
    const existing =
      await this.tenantPrisma.client.competitorObservation.findUnique({
        where: { id },
      });
    if (!existing) {
      throw new NotFoundException('Observation not found');
    }
    await this.tenantPrisma.client.competitorObservation.delete({
      where: { id },
    });
    return { success: true };
  }

  private serialize(r: {
    id: string;
    competitorId: string;
    kind: string;
    label: string;
    amount: { toString(): string } | null;
    endsAt: Date | null;
    source: string | null;
    observedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      competitorId: r.competitorId,
      kind: r.kind as 'price' | 'service' | 'offer',
      label: r.label,
      amount: r.amount != null ? Number(r.amount.toString()) : null,
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      source: r.source,
      observedAt: r.observedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
