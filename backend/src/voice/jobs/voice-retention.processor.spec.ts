import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { VoiceRetentionProcessor } from './voice-retention.processor';
import { RECORDING_RETENTION_DAYS } from '../voice.constants';

describe('VoiceRetentionProcessor (UPD-BE-059)', () => {
  let prisma: PrismaService;
  let processor: VoiceRetentionProcessor;
  let businessId: string;
  const s3 = { delete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new VoiceRetentionProcessor(prisma, s3 as unknown as S3Service);

    const business = await prisma.business.create({
      data: {
        name: 'Voice Retention Test Biz',
        slug: `voice-retention-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    s3.delete.mockReset();
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('purges a real expired call and its recording, but keeps a recent one', async () => {
    s3.delete.mockResolvedValue(undefined);
    const expiredDate = new Date(
      Date.now() - (RECORDING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    );

    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-expired',
        fromNumber: '+15550004001',
        startedAt: expiredDate,
        transcript: [
          { speaker: 'caller', recordingKey: 'voice-recordings/x/expired.mp3' },
        ],
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-recent',
        fromNumber: '+15550004002',
        startedAt: new Date(),
        transcript: [],
      },
    });

    await processor.runPurge();

    const expired = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired' },
    });
    const recent = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-recent' },
    });
    expect(expired).toBeNull();
    expect(recent).not.toBeNull();

    expect(s3.delete).toHaveBeenCalledWith('voice-recordings/x/expired.mp3');
  });

  it('does not abort the whole run when one row fails to purge', async () => {
    s3.delete.mockRejectedValueOnce(new Error('S3 unavailable'));
    const expiredDate = new Date(
      Date.now() - (RECORDING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    );

    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: 'CA-expired-fails',
          fromNumber: '+15550004003',
          startedAt: expiredDate,
          transcript: [
            { speaker: 'caller', recordingKey: 'voice-recordings/x/fails.mp3' },
          ],
        },
        {
          businessId,
          callSid: 'CA-expired-succeeds',
          fromNumber: '+15550004004',
          startedAt: expiredDate,
          transcript: [],
        },
      ],
    });

    await processor.runPurge();

    const failed = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired-fails' },
    });
    const succeeded = await prisma.phoneCall.findUnique({
      where: { callSid: 'CA-expired-succeeds' },
    });
    // The failing row's S3 delete threw before the DB delete ran, so it's still there — real, honest behavior, not silently dropped.
    expect(failed).not.toBeNull();
    expect(succeeded).toBeNull();
  });
});
