import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VideoTestimonialsService } from './video-testimonials.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { VideoTestimonialStatus } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VideoTestimonialsService (UPD-BE-027)', () => {
  let prisma: PrismaService;
  let service: VideoTestimonialsService;
  let businessId: string;
  let customerId: string;
  const sendGate = {
    send: jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue(undefined),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/video.mp4'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VideoTestimonialsService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
      activity as unknown as ActivityService,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Testimonials Test Biz',
        slug: `testimonials-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}`,
        name: 'Testimonial Customer',
      },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
    activity.record.mockClear();
    s3.getSignedDownloadUrl.mockClear();
  });

  afterAll(async () => {
    await prisma.videoTestimonial.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('requesting a testimonial creates a real row and sends a real notification', async () => {
    const testimonial = await service.request(businessId, {
      customerId,
      caption: 'Tell us about your visit',
    });

    expect(testimonial.status).toBe('requested');
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'video_testimonial_request' }),
    );
    const [sentArgs] =
      sendGate.send.mock.calls[sendGate.send.mock.calls.length - 1];
    const variables = sentArgs.variables as Record<string, string>;
    expect(variables.uploadUrl).toContain(testimonial.token);
  });

  it('rejects requesting a testimonial from a customer that does not exist', async () => {
    await expect(
      service.request(businessId, { customerId: 'not-a-real-id' }),
    ).rejects.toThrow();
  });

  it('rejects approving a testimonial that was never submitted', async () => {
    const testimonial = await service.request(businessId, { customerId });
    await expect(service.approve(testimonial.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('approving a submitted testimonial records activity and generates a fresh signed URL', async () => {
    const testimonial = await service.request(businessId, { customerId });
    await prisma.videoTestimonial.update({
      where: { id: testimonial.id },
      data: { status: 'submitted', videoKey: 'video-testimonials/abc.mp4' },
    });

    const approved = await service.approve(testimonial.id, 'staff-user-1');
    expect(approved.status).toBe('approved');
    expect(approved.videoUrl).toBe('https://signed.example/video.mp4');
    expect(s3.getSignedDownloadUrl).toHaveBeenCalledWith(
      'video-testimonials/abc.mp4',
    );
    expect(activity.record).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({ type: 'review', entityId: testimonial.id }),
    );
  });

  it('rejecting a submitted testimonial appends the reason and never approves it', async () => {
    const testimonial = await service.request(businessId, { customerId });
    await prisma.videoTestimonial.update({
      where: { id: testimonial.id },
      data: { status: 'submitted' },
    });

    const rejected = await service.reject(
      testimonial.id,
      { reason: 'Too blurry' },
      'staff-user-1',
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.caption).toContain('Too blurry');
  });

  it('a testimonial with no uploaded video yet has a null videoUrl, never a fabricated one', async () => {
    const testimonial = await service.request(businessId, { customerId });
    const fetched = await service.findOne(testimonial.id);
    expect(fetched.videoUrl).toBeNull();
    expect(s3.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('list() supports filtering by status', async () => {
    const all = await service.list();
    expect(all.length).toBeGreaterThan(0);

    const requestedOnly = await service.list(VideoTestimonialStatus.requested);
    expect(requestedOnly.every((t) => t.status === 'requested')).toBe(true);
  });
});
