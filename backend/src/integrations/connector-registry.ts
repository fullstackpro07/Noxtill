import { Injectable } from '@nestjs/common';
import { Connector } from './connector.interface';
import { GmbConnector } from './connectors/gmb.connector';
import { GoogleAdsConnector } from './connectors/google-ads.connector';
import { MerchantCenterConnector } from './connectors/merchant-center.connector';
import { MetaAdsConnector } from './connectors/meta-ads.connector';
import { TikTokAdsConnector } from './connectors/tiktok-ads.connector';
import { EmailConnector } from './connectors/email.connector';
import { BingPlacesConnector } from './connectors/bing-places.connector';
import { YelpConnector } from './connectors/yelp.connector';
import { AppleBusinessConnectConnector } from './connectors/apple-business-connect.connector';
import { IntegrationProvider } from '@prisma/client';

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
    bingPlaces: BingPlacesConnector,
    yelp: YelpConnector,
    appleBusinessConnect: AppleBusinessConnectConnector,
  ) {
    this.byProvider = {
      [IntegrationProvider.gmb]: gmb,
      [IntegrationProvider.google_ads]: googleAds,
      [IntegrationProvider.merchant]: merchant,
      [IntegrationProvider.meta_ads]: metaAds,
      [IntegrationProvider.tiktok_ads]: tiktokAds,
      [IntegrationProvider.email]: email,
      [IntegrationProvider.bing_places]: bingPlaces,
      [IntegrationProvider.yelp]: yelp,
      [IntegrationProvider.apple_business_connect]: appleBusinessConnect,
    };
  }

  get(provider: IntegrationProvider): Connector {
    return this.byProvider[provider];
  }

  all(): IntegrationProvider[] {
    return Object.values(IntegrationProvider);
  }

  /** Providers whose connector implements `pushListing` (UPD-BE-041) — the real, non-hardcoded way to know which providers are "directories" for Business Listings sync. */
  directoryProviders(): IntegrationProvider[] {
    return this.all().filter(
      (provider) => typeof this.get(provider).pushListing === 'function',
    );
  }
}
