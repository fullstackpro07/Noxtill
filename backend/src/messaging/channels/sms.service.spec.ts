import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SmsService (BE-017)', () => {
  it('posts to the Twilio Messages API and returns the SID as providerRef', async () => {
    mockedAxios.post.mockResolvedValue({ data: { sid: 'SM123' } });
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: '+10000000000',
    });
    const service = new SmsService(config);

    const result = await service.send({
      to: '+19999999999',
      text: 'hello',
      templateKey: 'owner_alert',
      locale: 'en',
      businessId: 'biz-1',
    });

    expect(result.providerRef).toBe('SM123');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest.Mocked method reference, not a real `this`-bound call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/Accounts/AC123/Messages.json'),
      expect.any(URLSearchParams),
      expect.objectContaining({
        auth: { username: 'AC123', password: 'secret' },
      }),
    );
  });
});
