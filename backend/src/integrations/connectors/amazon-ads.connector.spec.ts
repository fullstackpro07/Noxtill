import axios from 'axios';
import { gzipSync } from 'zlib';
import { ConfigService } from '@nestjs/config';
import { AmazonAdsConnector } from './amazon-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AmazonAdsConnector (UPD-BE-069)', () => {
  const config = new ConfigService({
    AMAZON_ADS_CLIENT_ID: 'test-client-id',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new AmazonAdsConnector(config);

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('fetchCampaignStats() (fatigue-warning depth fix)', () => {
    it("submits, polls once (SUCCESS), downloads and gunzips a real report, and reports on 'yesterday'", async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { reportId: 'rep-1' } }); // submit
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            status: 'SUCCESS',
            location: 'https://reports.example/report.json.gz',
          },
        }) // poll
        .mockResolvedValueOnce({
          data: gzipSync(
            Buffer.from(
              JSON.stringify([
                {
                  campaignId: 456,
                  impressions: 500,
                  clicks: 20,
                  cost: 12.5,
                  attributedConversions30d: 3,
                },
                {
                  campaignId: 999,
                  impressions: 1,
                  clicks: 1,
                  cost: 1,
                  attributedConversions30d: 1,
                },
              ]),
            ),
          ),
        }); // download

      const result = await connector.fetchCampaignStats(
        { accessToken: 'fake-token' },
        '456',
        { profileId: 'profile-1' },
      );

      expect(result).toEqual({
        spend: 12.5,
        impressions: 500,
        clicks: 20,
        results: 3,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://advertising-api.amazon.com/v2/sp/campaigns/report',
        expect.objectContaining({ campaignType: 'sponsoredProducts' }),
        expect.anything(),
      );
    });

    it('returns zeros when the campaign is not present in the real report rows', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { reportId: 'rep-1' } });
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            status: 'SUCCESS',
            location: 'https://reports.example/report.json.gz',
          },
        })
        .mockResolvedValueOnce({
          data: gzipSync(Buffer.from(JSON.stringify([]))),
        });

      const result = await connector.fetchCampaignStats(
        { accessToken: 'fake-token' },
        '456',
        { profileId: 'profile-1' },
      );
      expect(result).toEqual({
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
      });
    });

    it('rejects when no profile id is recorded', async () => {
      await expect(
        connector.fetchCampaignStats({ accessToken: 'fake-token' }, '456', {}),
      ).rejects.toThrow('No Amazon Advertising profile recorded');
    });

    it('throws when the report generation itself fails', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { reportId: 'rep-1' } });
      mockedAxios.get.mockResolvedValueOnce({ data: { status: 'FAILURE' } });

      await expect(
        connector.fetchCampaignStats({ accessToken: 'fake-token' }, '456', {
          profileId: 'profile-1',
        }),
      ).rejects.toThrow('report generation failed');
    });

    it('throws if the report never becomes ready within the bounded poll budget', async () => {
      jest.useFakeTimers();
      mockedAxios.post.mockResolvedValueOnce({ data: { reportId: 'rep-1' } });
      mockedAxios.get.mockResolvedValue({ data: { status: 'IN_PROGRESS' } });

      const promise = connector.fetchCampaignStats(
        { accessToken: 'fake-token' },
        '456',
        { profileId: 'profile-1' },
      );
      // Attach the assertion's handler before advancing timers, so the eventual rejection is
      // never briefly unhandled between settling and this test noticing it.
      const assertion = expect(promise).rejects.toThrow(
        'was not ready in time',
      );
      await jest.advanceTimersByTimeAsync(3000 * 10);
      await assertion;
    });
  });
});
