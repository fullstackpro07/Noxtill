import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MediaLibraryService } from './media-library.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { AppException } from '../common/filters/app.exception';
import type { S3Service } from '../common/storage/s3.service';
import type { AiInfraService } from '../ai/ai-infra.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (same pattern as public-video-testimonial.service.spec.ts/voice-sale.service.spec.ts).
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));
const mockedValidateUploadedFile = validateUploadedFile as jest.MockedFunction<
  typeof validateUploadedFile
>;

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MediaLibraryService (UPD-BE-047)', () => {
  let prisma: PrismaService;
  let service: MediaLibraryService;
  let businessId: string;

  const s3 = {
    upload: jest.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example.com/asset'),
  };
  const aiInfra = {
    generateImage: jest
      .fn<Promise<{ url: string }>, [string, string]>()
      .mockResolvedValue({ url: 'https://openai.example.com/generated.png' }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new MediaLibraryService(
      tenantPrisma,
      s3 as unknown as S3Service,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Media Library Test Biz',
        slug: `media-library-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('upload() validates the real file bytes, uploads to S3, and stores only the key', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // real JPEG magic bytes
    const asset = await service.upload(businessId, {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
    });
    expect(asset.type).toBe('image');
    expect(asset.source).toBe('upload');
    expect(asset.key).toContain(businessId);

    expect(s3.upload).toHaveBeenCalledWith(asset.key, buffer, 'image/jpeg');
  });

  it('upload() propagates a real validation failure (e.g. an oversized or wrong-type file) without storing anything', async () => {
    mockedValidateUploadedFile.mockRejectedValueOnce(
      new Error('UNSUPPORTED_FILE_TYPE'),
    );
    const buffer = Buffer.from('not a real image');
    await expect(
      service.upload(businessId, {
        buffer,
        size: buffer.length,
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow('UNSUPPORTED_FILE_TYPE');

    expect(s3.upload).not.toHaveBeenCalled();
  });

  it('generateImage() surfaces a clean, disclosed AI_UNAVAILABLE error rather than a raw 500 when the AI provider fails', async () => {
    aiInfra.generateImage.mockRejectedValueOnce(
      new Error('OPENAI_API_KEY is not configured'),
    );
    await expect(
      service.generateImage(businessId, { prompt: 'anything' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(s3.upload).not.toHaveBeenCalled();
  });

  it('generateImage() calls AiInfraService, downloads the real bytes, and re-uploads to our own S3', async () => {
    mockedAxios.get.mockResolvedValue({ data: Buffer.from('fake-png-bytes') });

    const asset = await service.generateImage(businessId, {
      prompt: 'a red bicycle',
    });
    expect(asset.source).toBe('ai_generated');
    expect(asset.prompt).toBe('a red bicycle');

    expect(aiInfra.generateImage).toHaveBeenCalledWith(
      businessId,
      'a red bicycle',
    );

    expect(s3.upload).toHaveBeenCalledWith(
      asset.key,
      expect.any(Buffer),
      'image/png',
    );
  });

  it('list() resolves a real signed URL for every asset, never a raw stored URL', async () => {
    const assets = await service.list(businessId);
    expect(assets.length).toBeGreaterThan(0);
    expect(
      assets.every((a) => a.url === 'https://signed.example.com/asset'),
    ).toBe(true);
  });

  it('update()/remove() reject an id belonging to a different business', async () => {
    const otherBusiness = await prisma.business.create({
      data: { name: 'Other Biz', slug: `other-biz-${Date.now()}` },
    });
    const otherAsset = await prisma.mediaAsset.create({
      data: {
        businessId: otherBusiness.id,
        key: 'x',
        type: 'image',
        source: 'upload',
      },
    });

    await expect(
      service.update(businessId, otherAsset.id, { tags: ['x'] }),
    ).rejects.toThrow();
    await expect(service.remove(businessId, otherAsset.id)).rejects.toThrow();

    await prisma.mediaAsset.delete({ where: { id: otherAsset.id } });
    await prisma.business.delete({ where: { id: otherBusiness.id } });
  });

  it('incrementUsage() bumps the real usage counter', async () => {
    const asset = await prisma.mediaAsset.create({
      data: {
        businessId,
        key: 'media/x/y.png',
        type: 'image',
        source: 'upload',
      },
    });
    await service.incrementUsage(businessId, 'media/x/y.png');
    const reloaded = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: asset.id },
    });
    expect(reloaded.usageCount).toBe(1);
  });
});
