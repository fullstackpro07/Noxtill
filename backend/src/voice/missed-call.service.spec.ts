import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { MissedCallService } from './missed-call.service';
import { PhoneCall } from '@prisma/client';

describe('MissedCallService (UPD-BE-059)', () => {
  let prisma: PrismaService;
  let service: MissedCallService;
  let businessId: string;
  const sendGate = { send: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new MissedCallService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Missed Call Test Biz',
        slug: `missed-call-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    sendGate.send.mockReset();
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('sends a real WhatsApp recovery message addressed to the caller number, not a customer', async () => {
    sendGate.send.mockResolvedValue({ id: 'msg-1' });
    const call = {
      businessId,
      callSid: 'CA-missed-1',
      fromNumber: '+15550001111',
    } as PhoneCall;

    await service.notify(call);

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'missed_call',
        to: { phone: '+15550001111' },
      }),
    );
  });

  it('never throws back into the caller when the send fails', async () => {
    sendGate.send.mockRejectedValue(new Error('quota exceeded'));
    const call = {
      businessId,
      callSid: 'CA-missed-2',
      fromNumber: '+15550002222',
    } as PhoneCall;

    await expect(service.notify(call)).resolves.toBeUndefined();
  });
});
