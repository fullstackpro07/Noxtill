import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleTrendsService } from './google-trends.service';

describe('GoogleTrendsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not call the provider when its shared SerpApi key is missing', async () => {
    const providerCall = jest.spyOn(axios, 'get');
    const service = new GoogleTrendsService({
      get: jest.fn().mockReturnValue(''),
    } as unknown as ConfigService);

    await expect(service.fetchInterest('coffee shop')).resolves.toBeNull();
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('returns the latest relative interest value from the provider response', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        interest_over_time: {
          timeline_data: [
            { values: [{ extracted_value: 32 }] },
            { values: [{ extracted_value: 61 }] },
          ],
        },
      },
    });
    const service = new GoogleTrendsService({
      get: jest.fn().mockReturnValue('configured-key'),
    } as unknown as ConfigService);

    await expect(service.fetchInterest('coffee shop')).resolves.toBe(61);
  });
});
