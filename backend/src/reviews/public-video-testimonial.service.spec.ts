import { PrismaService } from '../prisma/prisma.service';
import { PublicVideoTestimonialService } from './public-video-testimonial.service';
import { S3Service } from '../common/storage/s3.service';
import { generateReviewToken } from './review-token.util';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (same pattern as voice-sale.service.spec.ts/customer-import.service.spec.ts).
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

describe('PublicVideoTestimonialService (UPD-BE-027)', () => {
  let prisma: PrismaService;
  let service: PublicVideoTestimonialService;
  let businessId: string;
  let customerId: string;
  const s3 = {
    upload: jest.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: jest.fn(),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicVideoTestimonialService(
      prisma,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Public Testimonial Test Biz',
        slug: `public-testimonial-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Uploader Ursula' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    s3.upload.mockClear();
  });

  afterAll(async () => {
    await prisma.videoTestimonial.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const videoFile = {
    buffer: Buffer.from('fake video bytes'),
    size: 1000,
    mimetype: 'video/mp4',
  };

  it('getByToken resolves a real, requested testimonial', async () => {
    const testimonial = await prisma.videoTestimonial.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        caption: 'Say hi!',
      },
    });

    const result = await service.getByToken(testimonial.token);
    expect(result.businessName).toBe('Public Testimonial Test Biz');
    expect(result.caption).toBe('Say hi!');
  });

  it('404s on an unknown token', async () => {
    await expect(service.getByToken('not-a-real-token')).rejects.toThrow();
  });

  it('uploading a real video stores it in S3 and flips status to submitted', async () => {
    const testimonial = await prisma.videoTestimonial.create({
      data: { businessId, customerId, token: generateReviewToken() },
    });

    const result = await service.upload(testimonial.token, videoFile);
    expect(result.thankYou).toBe(true);
    expect(s3.upload).toHaveBeenCalledWith(
      expect.stringContaining(`video-testimonials/${businessId}/`),
      videoFile.buffer,
      'video/mp4',
    );

    const updated = await prisma.videoTestimonial.findUniqueOrThrow({
      where: { id: testimonial.id },
    });
    expect(updated.status).toBe('submitted');
    expect(updated.videoKey).toContain('.mp4');
  });

  it('rejects uploading twice through the same single-purpose token', async () => {
    const testimonial = await prisma.videoTestimonial.create({
      data: { businessId, customerId, token: generateReviewToken() },
    });
    await service.upload(testimonial.token, videoFile);

    await expect(
      service.upload(testimonial.token, videoFile),
    ).rejects.toThrow();
  });

  it('rejects a request against an already-submitted token via getByToken too', async () => {
    const testimonial = await prisma.videoTestimonial.create({
      data: { businessId, customerId, token: generateReviewToken() },
    });
    await service.upload(testimonial.token, videoFile);

    await expect(service.getByToken(testimonial.token)).rejects.toThrow();
  });

  it('404s on a token older than the expiry window', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const testimonial = await prisma.videoTestimonial.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        createdAt: oldDate,
      },
    });

    await expect(service.getByToken(testimonial.token)).rejects.toThrow();
  });
});
