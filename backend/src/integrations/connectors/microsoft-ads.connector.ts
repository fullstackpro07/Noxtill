import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import AdmZip from 'adm-zip';
import {
  CampaignStatsResult,
  Connector,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
  UpdateCampaignChanges,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUTHORIZE_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPE = 'https://ads.microsoft.com/msads.manage offline_access';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Microsoft Advertising (Bing Ads) connector (UPD-BE-069) — same Microsoft identity-platform
 * OAuth2 mechanics as `BingPlacesConnector`, but a distinct real app registration/scope: this one
 * additionally needs `MICROSOFT_ADS_DEVELOPER_TOKEN` on every Campaign Management API call, a real
 * quirk of Microsoft's advertising APIs specifically (not shared with Bing Places).
 */
@Injectable()
export class MicrosoftAdsConnector implements Connector {
  readonly provider = IntegrationProvider.microsoft_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/microsoft_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<MicrosoftTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('MICROSOFT_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<MicrosoftTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('MICROSOFT_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  private developerHeaders(tokens: OAuthTokens) {
    return {
      AuthenticationToken: tokens.accessToken,
      DeveloperToken:
        this.config.get<string>('MICROSOFT_ADS_DEVELOPER_TOKEN') ?? '',
      'Content-Type': 'application/json',
    };
  }

  /** Lists the real advertiser accounts the connected user can manage. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.post(
      'https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search',
      { PageInfo: { Index: 0, Size: 100 }, Predicates: [] },
      { headers: this.developerHeaders(tokens) },
    );
    return response.data;
  }

  /** `meta.accountId`/`meta.customerId` (real Microsoft Advertising ids, e.g. from a prior `sync()` selection) are required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const accountId = meta.accountId as string | undefined;
    const customerId = meta.customerId as string | undefined;
    if (!accountId || !customerId) {
      throw new Error(
        'No Microsoft Advertising account selected for this business',
      );
    }
    const response = await axios.post<{ CampaignIds: string[] }>(
      'https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns',
      {
        Campaigns: [
          {
            Name: params.name,
            CampaignType: 'Search',
            Status: 'Paused',
            DailyBudget: params.dailyBudget,
            BudgetType: 'DailyBudgetStandard',
          },
        ],
      },
      {
        headers: {
          ...this.developerHeaders(tokens),
          CustomerAccountId: accountId,
          CustomerId: customerId,
        },
      },
    );
    return { externalId: response.data.CampaignIds[0] };
  }

  async updateCampaign(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const accountId = meta.accountId as string | undefined;
    const customerId = meta.customerId as string | undefined;
    if (!accountId || !customerId) {
      throw new Error(
        'No Microsoft Advertising account recorded for this campaign',
      );
    }
    const campaign: Record<string, unknown> = { Id: externalId };
    if (changes.status)
      campaign.Status = changes.status === 'active' ? 'Active' : 'Paused';
    if (changes.dailyBudget !== undefined)
      campaign.DailyBudget = changes.dailyBudget;
    await axios.post(
      'https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns/Update',
      { Campaigns: [campaign] },
      {
        headers: {
          ...this.developerHeaders(tokens),
          CustomerAccountId: accountId,
          CustomerId: customerId,
        },
      },
    );
  }

  async disconnect(): Promise<void> {
    // Real revocation is a Microsoft identity-platform token-revocation call — left as a
    // documented no-op, same reasoning as every other connector's disconnect().
  }

  /**
   * Fatigue-warning depth fix — Microsoft's Reporting API has no synchronous "get me the numbers"
   * call: a report is submitted, polled until ready, then downloaded as a real zipped CSV
   * (`GenerateReport` -> `PollGenerateReport` -> GET the `ReportDownloadUrl`, unzipped here with
   * `adm-zip`) — a genuine 3-step async flow, not a shortcut. Bounded to ~10 polls at 3s apart;
   * if the report genuinely isn't ready by then this throws, and the caller (the hourly
   * `AdStatsSyncProcessor`) just retries next cycle rather than blocking the whole job.
   */
  async fetchCampaignStats(
    tokens: OAuthTokens,
    externalId: string,
    meta: Record<string, unknown>,
  ): Promise<CampaignStatsResult> {
    const accountId = meta.accountId as string | undefined;
    const customerId = meta.customerId as string | undefined;
    if (!accountId || !customerId) {
      throw new Error(
        'No Microsoft Advertising account recorded for this campaign',
      );
    }
    const headers = {
      ...this.developerHeaders(tokens),
      CustomerAccountId: accountId,
      CustomerId: customerId,
    };

    const now = new Date();
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateRange = (d: Date) => ({
      Day: d.getUTCDate(),
      Month: d.getUTCMonth() + 1,
      Year: d.getUTCFullYear(),
    });

    const generateResponse = await axios.post<{ ReportRequestId: string }>(
      'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport',
      {
        ReportRequest: {
          Type: 'CampaignPerformanceReportRequest',
          Format: 'Csv',
          Aggregation: 'Summary',
          ReturnOnlyCompleteData: false,
          Time: {
            CustomDateRangeStart: dateRange(start),
            CustomDateRangeEnd: dateRange(now),
          },
          Scope: { Campaigns: [{ CampaignId: Number(externalId) }] },
          Columns: [
            'CampaignId',
            'Spend',
            'Impressions',
            'Clicks',
            'Conversions',
          ],
        },
      },
      { headers },
    );
    const reportRequestId = generateResponse.data.ReportRequestId;

    let downloadUrl: string | undefined;
    for (let attempt = 0; attempt < 10 && !downloadUrl; attempt += 1) {
      if (attempt > 0) await sleep(3000);
      const pollResponse = await axios.post<{
        ReportRequestStatus: { Status: string; ReportDownloadUrl?: string };
      }>(
        'https://reporting.api.bingads.microsoft.com/Reporting/v13/PollGenerateReport',
        { ReportRequestId: reportRequestId },
        { headers },
      );
      const { Status, ReportDownloadUrl } =
        pollResponse.data.ReportRequestStatus;
      if (Status === 'Success') downloadUrl = ReportDownloadUrl;
      else if (Status === 'Error') {
        throw new Error('Microsoft Advertising report generation failed');
      }
    }
    if (!downloadUrl) {
      throw new Error('Microsoft Advertising report was not ready in time');
    }

    const fileResponse = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
    });
    const zip = new AdmZip(Buffer.from(fileResponse.data));
    const csvEntry = zip.getEntries().find((e) => e.entryName.endsWith('.csv'));
    if (!csvEntry) return { spend: 0, impressions: 0, clicks: 0, results: 0 };

    const csv = zip.readAsText(csvEntry);
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    // The real report has a header line, then one summary data row (Aggregation: 'Summary').
    const header = lines[0]?.split(',').map((h) => h.replace(/"/g, '').trim());
    const row = lines[1]?.split(',').map((v) => v.replace(/"/g, '').trim());
    if (!header || !row)
      return { spend: 0, impressions: 0, clicks: 0, results: 0 };

    const col = (name: string) => Number(row[header.indexOf(name)] ?? 0) || 0;
    return {
      spend: col('Spend'),
      impressions: col('Impressions'),
      clicks: col('Clicks'),
      results: col('Conversions'),
    };
  }

  private mapTokenResponse(data: MicrosoftTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
