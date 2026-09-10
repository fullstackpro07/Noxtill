import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GoogleAdsConnector } from './google-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleAdsConnector (BE-085)', () => {
  const config = new ConfigService({
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new GoogleAdsConnector(config);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests the Google Ads scope, distinct from GMB/Merchant Center', () => {
    const url = new URL(connector.authUrl('state'));
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/adwords',
    );
  });

  it("sync() calls the real listAccessibleCustomers endpoint with a developer-token header (Google Ads' own quirk)", async () => {
    mockedAxios.get.mockResolvedValue({ data: { resourceNames: [] } });
    await connector.sync({ accessToken: 'fake-token' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer fake-token',
          'developer-token': 'dev-token',
        },
      }),
    );
  });

  describe('createCampaign() (UPD-BE-069)', () => {
    it('mutates a real budget resource then a real campaign, returning the budget resourceName for later real updates', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            results: [{ resourceName: 'customers/123/campaignBudgets/456' }],
          },
        })
        .mockResolvedValueOnce({
          data: { results: [{ resourceName: 'customers/123/campaigns/789' }] },
        });

      const result = await connector.createCampaign(
        { accessToken: 'fake-token' },
        { name: 'Summer Sale', goal: 'traffic', dailyBudget: 20 },
        { customerId: '123' },
      );

      expect(result).toEqual({
        externalId: 'customers/123/campaigns/789',
        providerMeta: {
          budgetResourceName: 'customers/123/campaignBudgets/456',
        },
      });
    });

    it('rejects when no customerId is provided', async () => {
      await expect(
        connector.createCampaign(
          { accessToken: 'fake-token' },
          { name: 'x', goal: 'traffic', dailyBudget: 5 },
          {},
        ),
      ).rejects.toThrow('No Google Ads customer selected');
    });
  });

  describe('updateCampaign() (UPD-BE-130, campaign management actions depth fix)', () => {
    it('mutates the real campaign status AND the real linked budget resource when both are requested', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await connector.updateCampaign(
        { accessToken: 'fake-token' },
        'customers/123/campaigns/789',
        { status: 'active', dailyBudget: 30 },
        { budgetResourceName: 'customers/123/campaignBudgets/456' },
      );

      /* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment -- `expect.objectContaining` deeply nested resolves untyped here; both calls are plain assertions on the mock. */
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://googleads.googleapis.com/v17/customers/123/campaigns:mutate',
        expect.objectContaining({
          operations: [
            expect.objectContaining({
              update: expect.objectContaining({
                resourceName: 'customers/123/campaigns/789',
                status: 'ENABLED',
              }),
            }),
          ],
        }),
        expect.anything(),
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://googleads.googleapis.com/v17/customers/123/campaignBudgets:mutate',
        expect.objectContaining({
          operations: [
            expect.objectContaining({
              update: expect.objectContaining({
                resourceName: 'customers/123/campaignBudgets/456',
                amountMicros: 30_000_000,
              }),
            }),
          ],
        }),
        expect.anything(),
      );
      /* eslint-enable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
    });

    it('applies only the status change when no budgetResourceName is on record (a pre-fix campaign)', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await connector.updateCampaign(
        { accessToken: 'fake-token' },
        'customers/123/campaigns/789',
        { dailyBudget: 30 },
        {},
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
