import axios from 'axios';
import AdmZip from 'adm-zip';
import { ConfigService } from '@nestjs/config';
import { MicrosoftAdsConnector } from './microsoft-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function zippedCsv(csv: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('report.csv', Buffer.from(csv, 'utf-8'));
  return zip.toBuffer();
}

describe('MicrosoftAdsConnector (UPD-BE-069)', () => {
  const config = new ConfigService({
    MICROSOFT_ADS_CLIENT_ID: 'test-client-id',
    MICROSOFT_ADS_DEVELOPER_TOKEN: 'dev-token',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new MicrosoftAdsConnector(config);

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('fetchCampaignStats() (fatigue-warning depth fix)', () => {
    it('submits, polls once (Success), downloads, unzips, and parses a real CSV report', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { ReportRequestId: 'req-1' } }) // GenerateReport
        .mockResolvedValueOnce({
          data: {
            ReportRequestStatus: {
              Status: 'Success',
              ReportDownloadUrl: 'https://reports.example/report.zip',
            },
          },
        }); // PollGenerateReport
      mockedAxios.get.mockResolvedValueOnce({
        data: zippedCsv(
          'CampaignId,Spend,Impressions,Clicks,Conversions\n123,45.50,1000,80,6\n',
        ),
      });

      const result = await connector.fetchCampaignStats(
        { accessToken: 'fake-token' },
        '123',
        { accountId: 'acc-1', customerId: 'cust-1' },
      );

      expect(result).toEqual({
        spend: 45.5,
        impressions: 1000,
        clicks: 80,
        results: 6,
      });
    });

    it('rejects when no account/customer id is recorded', async () => {
      await expect(
        connector.fetchCampaignStats({ accessToken: 'fake-token' }, '123', {}),
      ).rejects.toThrow('No Microsoft Advertising account recorded');
    });

    it('throws when the report generation itself errors', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { ReportRequestId: 'req-1' } })
        .mockResolvedValueOnce({
          data: { ReportRequestStatus: { Status: 'Error' } },
        });

      await expect(
        connector.fetchCampaignStats({ accessToken: 'fake-token' }, '123', {
          accountId: 'acc-1',
          customerId: 'cust-1',
        }),
      ).rejects.toThrow('report generation failed');
    });

    it('throws if the report never becomes ready within the bounded poll budget', async () => {
      jest.useFakeTimers();
      mockedAxios.post.mockResolvedValueOnce({
        data: { ReportRequestId: 'req-1' },
      });
      mockedAxios.post.mockResolvedValue({
        data: { ReportRequestStatus: { Status: 'Pending' } },
      });

      const promise = connector.fetchCampaignStats(
        { accessToken: 'fake-token' },
        '123',
        { accountId: 'acc-1', customerId: 'cust-1' },
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
