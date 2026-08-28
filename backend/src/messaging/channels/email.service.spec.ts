import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EmailService (BE-017)', () => {
  it('posts to the Resend API and returns the id as providerRef', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'msg-123' } });
    const config = new ConfigService({
      EMAIL_PROVIDER_KEY: 're-token',
      EMAIL_FROM_ADDRESS: 'hello@noxtill.app',
    });
    const service = new EmailService(config);

    const result = await service.send({
      to: 'customer@example.com',
      text: 'Your receipt is ready',
      templateKey: 'receipt',
      locale: 'en',
      businessId: 'biz-1',
    });

    expect(result.providerRef).toBe('msg-123');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest.Mocked method reference, not a real `this`-bound call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Receipt',
      }),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matcher typing noise, not app logic
        headers: expect.objectContaining({
          Authorization: 'Bearer re-token',
        }),
      }),
    );
  });
});
