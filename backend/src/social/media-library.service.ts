import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { GenerateMediaImageDto, UpdateMediaAssetDto } from './dto/media.dto';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
];

/**
 * Media Library (UPD-BE-047). `key` on `MediaAsset` is an S3 object key, never a raw URL — same
 * "store the key, resolve a signed URL lazily on read" convention as `VideoTestimonial.videoKey`
 * and every other S3-backed model in this codebase.
 */
@Injectable()
export class MediaLibraryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly aiInfra: AiInfraService,
  ) {}

  async list(businessId: string, type?: string) {
    const assets = await this.tenantPrisma.client.mediaAsset.findMany({
      where: { businessId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        url: await this.s3.getSignedDownloadUrl(asset.key),
      })),
    );
  }

  async upload(
    businessId: string,
    file: { buffer: Buffer; size: number; mimetype: string },
  ) {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSizeBytes: MAX_UPLOAD_BYTES,
    });

    const ext = file.mimetype.split('/')[1] ?? 'bin';
    const key = `media/${businessId}/${randomUUID()}.${ext}`;
    await this.s3.upload(key, file.buffer, file.mimetype);

    return this.tenantPrisma.client.mediaAsset.create({
      data: {
        businessId,
        key,
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        source: 'upload',
      },
    });
  }

  /**
   * AI Content Studio's image generator (UPD-BE-048) lands here too — `AiInfraService.generateImage`
   * returns a real but ephemeral OpenAI-hosted URL, so this downloads the real bytes and re-uploads
   * them to our own S3 for permanence, same as every other externally-sourced asset in this app.
   */
  async generateImage(businessId: string, dto: GenerateMediaImageDto) {
    let url: string;
    try {
      ({ url } = await this.aiInfra.generateImage(businessId, dto.prompt));
    } catch (error) {
      if (error instanceof AppException) throw error; // rate-limit / cost-cap errors already typed
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI image generator is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data);

    const key = `media/${businessId}/${randomUUID()}.png`;
    await this.s3.upload(key, buffer, 'image/png');

    return this.tenantPrisma.client.mediaAsset.create({
      data: {
        businessId,
        key,
        type: 'image',
        source: 'ai_generated',
        prompt: dto.prompt,
        tags: dto.tags ?? [],
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateMediaAssetDto) {
    await this.find(businessId, id);
    return this.tenantPrisma.client.mediaAsset.update({
      where: { id },
      data: { tags: dto.tags },
    });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.find(businessId, id);
    await this.tenantPrisma.client.mediaAsset.delete({ where: { id } });
  }

  /** Called by `SocialPostsService` whenever a post actually uses this asset — real usage tracking, not a placeholder counter. */
  async incrementUsage(businessId: string, key: string): Promise<void> {
    await this.tenantPrisma.client.mediaAsset.updateMany({
      where: { businessId, key },
      data: { usageCount: { increment: 1 } },
    });
  }

  private async find(businessId: string, id: string) {
    const asset = await this.tenantPrisma.client.mediaAsset.findUnique({
      where: { id },
    });
    if (!asset || asset.businessId !== businessId) {
      throw new NotFoundException('Media asset not found');
    }
    return asset;
  }
}
