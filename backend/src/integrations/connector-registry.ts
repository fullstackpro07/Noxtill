import { Injectable } from '@nestjs/common';
import { Connector } from './connector.interface';
import { GmbConnector } from './connectors/gmb.connector';
import { GoogleAdsConnector } from './connectors/google-ads.connector';
import { MerchantCenterConnector } from './connectors/merchant-center.connector';
import { MetaAdsConnector } from './connectors/meta-ads.connector';
import { TikTokAdsConnector } from './connectors/tiktok-ads.connector';
import { EmailConnector } from './connectors/email.connector';
import { IntegrationProvider } from '../../generated/prisma';

@Injectable()
export class ConnectorRegistry {
  private readonly byProvider: Record<IntegrationProvider, Connector>;

  constructor(
    gmb: GmbConnector,
    googleAds: GoogleAdsConnector,
    merchant: MerchantCenterConnector,
    metaAds: MetaAdsConnector,
    tiktokAds: TikTokAdsConnector,
    email: EmailConnector,
  ) {
    this.byProvider = {
      [IntegrationProvider.gmb]: gmb,
      [IntegrationProvider.google_ads]: googleAds,
      [IntegrationProvider.merchant]: merchant,
      [IntegrationProvider.meta_ads]: metaAds,
      [IntegrationProvider.tiktok_ads]: tiktokAds,
      [IntegrationProvider.email]: email,
    };
  }

  get(provider: IntegrationProvider): Connector {
    return this.byProvider[provider];
  }

  all(): IntegrationProvider[] {
    return Object.values(IntegrationProvider);
  }
}
