import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { MARKETING_ERROR_CODES, MAX_TRACKED_KEYWORDS } from './marketing.constants';
import { KeywordRankProcessor } from './jobs/keyword-rank.processor';

const HISTORY_CHECKS = 12;

/** Keyword rank tracking (new, BE-063 extension) — real CRUD + a pluggable SERP-rank provider. */
@Injectable()
export class KeywordsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rankProcessor: KeywordRankProcessor,
  ) {}

  async list() {
    const keywords = await this.tenantPrisma.client.trackedKeyword.findMany({
      orderBy: { createdAt: 'asc' },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });

    return keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      latestRank: k.snapshots[0]?.rank ?? null,
      lastCheckedAt: k.snapshots[0]?.capturedAt.toISOString() ?? null,
    }));
  }

  async create(businessId: string, dto: CreateTrackedKeywordDto) {
    const count = await this.tenantPrisma.client.trackedKeyword.count();
    if (count >= MAX_TRACKED_KEYWORDS) {
      throw new AppException(
        MARKETING_ERROR_CODES.KEYWORD_LIMIT_REACHED,
        `You can track at most ${MAX_TRACKED_KEYWORDS} keywords`,
        HttpStatus.FORBIDDEN,
      );
    }

    const existing = await this.tenantPrisma.client.trackedKeyword.findFirst({
      where: { keyword: dto.keyword },
    });
    if (existing) {
      throw new AppException(
        MARKETING_ERROR_CODES.KEYWORD_ALREADY_TRACKED,
        'This keyword is already being tracked',
        HttpStatus.CONFLICT,
      );
    }

    return this.tenantPrisma.client.trackedKeyword.create({
      data: { businessId, keyword: dto.keyword },
    });
  }

  async remove(id: string) {
    const existing = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Tracked keyword not found');
    }
    await this.tenantPrisma.client.trackedKeyword.delete({ where: { id } });
    return { success: true };
  }

  /** Last 12 checks, oldest first. */
  async history(id: string) {
    const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!keyword) {
      throw new NotFoundException('Tracked keyword not found');
    }

    const snapshots = await this.tenantPrisma.client.keywordRankSnapshot.findMany(
      {
        where: { keywordId: id },
        orderBy: { capturedAt: 'desc' },
        take: HISTORY_CHECKS,
      },
    );

    return snapshots
      .reverse()
      .map((s) => ({ rank: s.rank, capturedAt: s.capturedAt.toISOString() }));
  }

  /** "Check now" — the weekly job does the same thing, this runs it synchronously for one keyword on demand. */
  async triggerCheck(businessId: string, id: string) {
    const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!keyword) {
      throw new NotFoundException('Tracked keyword not found');
    }

    await this.rankProcessor.checkOne(businessId, keyword.id, keyword.keyword);
    return this.history(id);
  }
}
