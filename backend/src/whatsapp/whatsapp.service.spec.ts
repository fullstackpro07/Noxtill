import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWindowService } from './whatsapp-window.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WhatsappService (BE-016)', () => {
  let service: WhatsappService;
  let window: { isOpen: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    window = { isOpen: jest.fn() };
    const config = new ConfigService({
      META_WA_PHONE_ID: 'phone-123',
      META_WA_TOKEN: 'token-abc',
    });
    service = new WhatsappService(
      config,
      window as unknown as WhatsappWindowService,
    );
    mockedAxios.post.mockResolvedValue({
      data: { messages: [{ id: 'wamid.123' }] },
    });
  });

  it('sends free-form text when the 24h window is open', async () => {
    window.isOpen.mockResolvedValue(true);

    const result = await service.send({
      to: '+10000000000',
      text: 'Hello there',
      templateKey: 'owner_alert',
      locale: 'en',
      businessId: 'biz-1',
      customerId: 'cust-1',
    });

    expect(result.providerRef).toBe('wamid.123');
    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toMatchObject({ type: 'text', text: { body: 'Hello there' } });
  });

  it('falls back to a template message when the window is closed', async () => {
    window.isOpen.mockResolvedValue(false);

    await service.send({
      to: '+10000000000',
      text: 'Hello there',
      templateKey: 'owner_alert',
      locale: 'en',
      businessId: 'biz-1',
      customerId: 'cust-1',
    });

    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toMatchObject({
      type: 'template',
      template: { name: 'owner_alert', language: { code: 'en' } },
    });
  });

  it('treats a send with no customerId as outside the window (template send)', async () => {
    await service.send({
      to: '+10000000000',
      text: 'Hello there',
      templateKey: 'owner_alert',
      locale: 'en',
      businessId: 'biz-1',
    });

    expect(window.isOpen).not.toHaveBeenCalled();
    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toMatchObject({ type: 'template' });
  });
});
