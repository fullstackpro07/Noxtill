import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCipherService } from '../integrations/token-cipher.service';
import { WhatsappService } from './whatsapp.service';
import type { WhatsappWindowService } from './whatsapp-window.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WhatsappService — a business’s own WhatsApp Business number (Integrations redesign)', () => {
  let prisma: PrismaService;
  let cipher: TokenCipherService;
  let service: WhatsappService;
  let businessId: string;
  const params = () => ({
    to: '+10000000000',
    text: 'Hi',
    templateKey: 'owner_alert',
    locale: 'en',
    businessId,
    customerId: 'c1',
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = new ConfigService({
      META_WA_PHONE_ID: 'platform-phone',
      META_WA_TOKEN: 'platform-token',
      INTEGRATIONS_TOKEN_KEY: randomBytes(32).toString('base64'),
    });
    cipher = new TokenCipherService(config);
    service = new WhatsappService(
      config,
      {
        isOpen: jest.fn().mockResolvedValue(true),
      } as unknown as WhatsappWindowService,
      prisma,
      cipher,
    );
    const business = await prisma.business.create({
      data: { name: 'WA Own Number Biz', slug: `wa-own-${Date.now()}` },
    });
    businessId = business.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({
      data: { messages: [{ id: 'wamid.1' }] },
    });
  });

  afterAll(async () => {
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  const connectOwn = (extra: Record<string, unknown> = {}) =>
    prisma.integration.upsert({
      where: { businessId_provider: { businessId, provider: 'whatsapp' } },
      create: {
        businessId,
        provider: 'whatsapp',
        status: 'connected',
        tokens: cipher.encrypt(
          JSON.stringify({
            accessToken: 'own-token',
            providerMeta: { phoneNumberId: 'own-phone' },
          }),
        ),
        ...extra,
      },
      update: {
        status: 'connected',
        pausedAt: null,
        tokens: cipher.encrypt(
          JSON.stringify({
            accessToken: 'own-token',
            providerMeta: { phoneNumberId: 'own-phone' },
          }),
        ),
        ...extra,
      },
    });

  it('uses the shared platform number until the business connects its own', async () => {
    await service.send(params());
    const [url, , options] = mockedAxios.post.mock.calls[0] as unknown as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    expect(url).toContain('/platform-phone/messages');
    expect(options.headers.Authorization).toBe('Bearer platform-token');
    expect(
      await prisma.integrationSyncLog.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('sends from the business’s own number once connected, and logs each message', async () => {
    await connectOwn();
    await service.send(params());
    const [url, , options] = mockedAxios.post.mock.calls[0] as unknown as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    expect(url).toContain('/own-phone/messages');
    expect(options.headers.Authorization).toBe('Bearer own-token');
    const log = await prisma.integrationSyncLog.findFirstOrThrow({
      where: { businessId, provider: 'whatsapp' },
    });
    expect(log).toMatchObject({ success: true, recordsProcessed: 1 });
    expect(
      (
        await prisma.integration.findUniqueOrThrow({
          where: { businessId_provider: { businessId, provider: 'whatsapp' } },
        })
      ).lastSyncAt,
    ).not.toBeNull();
  });

  it('logs a rejected message as a failure, and still throws it so the message pipeline can retry', async () => {
    await connectOwn();
    mockedAxios.post.mockRejectedValue(new Error('401 invalid token'));
    await expect(service.send(params())).rejects.toThrow('401 invalid token');
    const failed = await prisma.integrationSyncLog.findFirstOrThrow({
      where: { businessId, provider: 'whatsapp', success: false },
    });
    expect(failed).toMatchObject({
      recordsFailed: 1,
      message: '401 invalid token',
    });
  });

  it('falls back to the shared number while the business’s own connection is paused', async () => {
    await connectOwn({ pausedAt: new Date() });
    await service.send(params());
    const [url] = mockedAxios.post.mock.calls[0] as unknown as [string];
    expect(url).toContain('/platform-phone/messages');
  });
});
