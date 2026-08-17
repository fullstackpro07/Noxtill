import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { IntegrationsService } from '../integrations/integrations.service';
import { GmbConnector } from '../integrations/connectors/gmb.connector';
import { CreateGmbPhotoDto, CreateGmbPostDto } from './dto/gmb.dto';
import { LISTING_ERROR_CODES } from './listings.constants';
import { GmbPostStatus, IntegrationProvider } from '../../generated/prisma';

interface GmbQuestionsListResponse {
  questions?: { name: string; text: string }[];
}

interface GmbMetricsResponse {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric?: string;
      timeSeries?: { datedValues?: { value?: string }[] };
    }[];
  }[];
}

/**
 * GMB deep management (UPD-BE-042) — posts/photos/Q&A CRUD on top of the already-scaffolded-but-
 * dormant `GmbPost` model (confirmed unused anywhere before this ticket) plus the two new
 * `GmbPhoto`/`GmbQna` models. Real API calls are attempted for every push/sync action; when no
 * real Google OAuth credentials are connected in this environment they fail cleanly with a clear
 * error (the same disclosed-gap pattern used throughout this codebase), never a faked success.
 */
@Injectable()
export class GmbManagementService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly gmbConnector: GmbConnector,
  ) {}

  /**
   * Location picker step (fixes a real gap: `publishPost`/`syncQuestions`/`pullInsights` all
   * require `meta.locationId`, but nothing previously let a business set it). Lists the real
   * Google Business accounts the connected identity manages.
   */
  async listAccounts(businessId: string): Promise<unknown> {
    const { tokens } = await this.requireGmbConnection(businessId);
    return this.gmbConnector.sync(tokens);
  }

  /** Lists the real locations under `accountName` (e.g. `accounts/123`, from `listAccounts()`). */
  async listLocations(
    businessId: string,
    accountName: string,
  ): Promise<unknown> {
    const { tokens } = await this.requireGmbConnection(businessId);
    return this.gmbConnector.listLocations(tokens, accountName);
  }

  /** Persists the chosen location into `Integration.meta.locationId` — every locationId-gated action reads it from here. */
  async selectLocation(
    businessId: string,
    locationId: string,
  ): Promise<{ locationId: string }> {
    const { meta } = await this.requireGmbConnection(businessId);
    await this.tenantPrisma.client.integration.update({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
      data: { meta: { ...meta, locationId } },
    });
    return { locationId };
  }

  listPosts(businessId: string) {
    return this.tenantPrisma.client.gmbPost.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createPost(businessId: string, dto: CreateGmbPostDto) {
    return this.tenantPrisma.client.gmbPost.create({
      data: {
        businessId,
        text: dto.text,
        photoUrl: dto.photoUrl,
        buttonType: dto.buttonType,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        status: GmbPostStatus.draft,
      },
    });
  }

  async deletePost(businessId: string, postId: string): Promise<void> {
    await this.findPost(businessId, postId);
    await this.tenantPrisma.client.gmbPost.delete({ where: { id: postId } });
  }

  /** Pushes a draft post to the real GMB Local Posts API. */
  async publishPost(businessId: string, postId: string) {
    const post = await this.findPost(businessId, postId);
    const { tokens, meta } = await this.requireGmbConnection(businessId);
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new AppException(
        LISTING_ERROR_CODES.GMB_NOT_CONNECTED,
        'No GMB location selected for this business — connect a location before publishing',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await axios.post<{ name: string }>(
        `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
        {
          summary: post.text,
          callToAction: post.buttonType
            ? { actionType: post.buttonType }
            : undefined,
          media: post.photoUrl
            ? [{ mediaFormat: 'PHOTO', sourceUrl: post.photoUrl }]
            : undefined,
        },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      );
      return this.tenantPrisma.client.gmbPost.update({
        where: { id: postId },
        data: {
          status: GmbPostStatus.published,
          externalId: response.data.name,
        },
      });
    } catch (error) {
      await this.tenantPrisma.client.gmbPost.update({
        where: { id: postId },
        data: { status: GmbPostStatus.failed },
      });
      throw new AppException(
        LISTING_ERROR_CODES.GMB_NOT_CONNECTED,
        `Failed to publish to GMB: ${(error as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  listPhotos(businessId: string) {
    return this.tenantPrisma.client.gmbPhoto.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  addPhoto(businessId: string, dto: CreateGmbPhotoDto) {
    return this.tenantPrisma.client.gmbPhoto.create({
      data: { businessId, url: dto.url, category: dto.category },
    });
  }

  async removePhoto(businessId: string, photoId: string): Promise<void> {
    const photo = await this.tenantPrisma.client.gmbPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.businessId !== businessId) {
      throw new NotFoundException('GMB photo not found');
    }
    await this.tenantPrisma.client.gmbPhoto.delete({ where: { id: photoId } });
  }

  listQna(businessId: string) {
    return this.tenantPrisma.client.gmbQna.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Pulls real questions from the GMB Q&A API and upserts by externalId — questions come FROM Google, not created locally. */
  async syncQuestions(businessId: string): Promise<number> {
    const { tokens, meta } = await this.requireGmbConnection(businessId);
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new AppException(
        LISTING_ERROR_CODES.GMB_NOT_CONNECTED,
        'No GMB location selected for this business — connect a location before syncing Q&A',
        HttpStatus.BAD_REQUEST,
      );
    }

    const response = await axios.get<GmbQuestionsListResponse>(
      `https://mybusinessqanda.googleapis.com/v1/${locationId}/questions`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    const questions = response.data.questions ?? [];

    for (const question of questions) {
      await this.tenantPrisma.client.gmbQna.upsert({
        where: { externalId: question.name },
        create: {
          businessId,
          question: question.text,
          externalId: question.name,
        },
        update: { question: question.text },
      });
    }
    return questions.length;
  }

  /** Posts a real answer via the GMB Q&A API, then updates the local row on success only. */
  async answerQuestion(businessId: string, qnaId: string, answer: string) {
    const qna = await this.tenantPrisma.client.gmbQna.findUnique({
      where: { id: qnaId },
    });
    if (!qna || qna.businessId !== businessId) {
      throw new NotFoundException('GMB question not found');
    }
    if (!qna.externalId) {
      throw new AppException(
        LISTING_ERROR_CODES.GMB_QNA_NOT_FOUND,
        'This question has no real GMB externalId to answer against',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { tokens } = await this.requireGmbConnection(businessId);
    await axios.post(
      `https://mybusinessqanda.googleapis.com/v1/${qna.externalId}/answers:upsert`,
      { answer: { text: answer } },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );

    return this.tenantPrisma.client.gmbQna.update({
      where: { id: qnaId },
      data: { answer, answeredAt: new Date() },
    });
  }

  listInsights(businessId: string) {
    return this.tenantPrisma.client.gmbInsightsSnapshot.findMany({
      where: { businessId },
      orderBy: { date: 'desc' },
      take: 90,
    });
  }

  /**
   * Pulls yesterday's real Performance-API metrics and upserts a `GmbInsightsSnapshot`. Requires
   * `meta.locationId` (see `requireGmbConnection`'s callers) — there's no location-picker step in
   * this ticket, so this throws the same clear, real "not connected" error until one is set,
   * rather than faking a snapshot.
   */
  async pullInsights(businessId: string) {
    const { tokens, meta } = await this.requireGmbConnection(businessId);
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new AppException(
        LISTING_ERROR_CODES.GMB_NOT_CONNECTED,
        'No GMB location selected for this business — connect a location before pulling insights',
        HttpStatus.BAD_REQUEST,
      );
    }

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const response = await axios.get<GmbMetricsResponse>(
      `https://businessprofileperformance.googleapis.com/v1/${locationId}:fetchMultiDailyMetricsTimeSeries`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        params: {
          dailyMetrics: [
            'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
            'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
            'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
            'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
            'CALL_CLICKS',
            'BUSINESS_DIRECTION_REQUESTS',
          ],
        },
      },
    );

    const metrics = this.extractMetrics(response.data);
    return this.tenantPrisma.client.gmbInsightsSnapshot.upsert({
      where: { businessId_date: { businessId, date: yesterday } },
      create: { businessId, date: yesterday, ...metrics },
      update: metrics,
    });
  }

  private extractMetrics(data: GmbMetricsResponse): {
    views: number;
    searches: number;
    calls: number;
    directionRequests: number;
  } {
    const sum = (metric: string): number =>
      (data.multiDailyMetricTimeSeries ?? [])
        .flatMap((series) => series.dailyMetricTimeSeries ?? [])
        .filter((series) => series.dailyMetric === metric)
        .flatMap((series) => series.timeSeries?.datedValues ?? [])
        .reduce((total, entry) => total + Number(entry.value ?? 0), 0);

    return {
      views:
        sum('BUSINESS_IMPRESSIONS_DESKTOP_MAPS') +
        sum('BUSINESS_IMPRESSIONS_MOBILE_MAPS'),
      searches:
        sum('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') +
        sum('BUSINESS_IMPRESSIONS_MOBILE_SEARCH'),
      calls: sum('CALL_CLICKS'),
      directionRequests: sum('BUSINESS_DIRECTION_REQUESTS'),
    };
  }

  private async findPost(businessId: string, postId: string) {
    const post = await this.tenantPrisma.client.gmbPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.businessId !== businessId) {
      throw new NotFoundException('GMB post not found');
    }
    return post;
  }

  private async requireGmbConnection(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    const tokens = await this.integrations.getTokens(
      businessId,
      IntegrationProvider.gmb,
    );
    if (!integration || !tokens) {
      throw new AppException(
        LISTING_ERROR_CODES.GMB_NOT_CONNECTED,
        'Connect Google Business Profile before managing GMB content',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { tokens, meta: integration.meta as Record<string, unknown> };
  }
}
