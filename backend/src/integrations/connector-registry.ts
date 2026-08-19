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
import { LinkedInAdsConnector } from './connectors/linkedin-ads.connector';
import { PinterestAdsConnector } from './connectors/pinterest-ads.connector';
import { SnapchatAdsConnector } from './connectors/snapchat-ads.connector';
import { MicrosoftAdsConnector } from './connectors/microsoft-ads.connector';
import { AmazonAdsConnector } from './connectors/amazon-ads.connector';
import { RedditAdsConnector } from './connectors/reddit-ads.connector';
import { QuickBooksConnector } from './connectors/quickbooks.connector';
import { XeroConnector } from './connectors/xero.connector';
import { ShopifyConnector } from './connectors/shopify.connector';
import { WooCommerceConnector } from './connectors/woocommerce.connector';
import { IntegrationProvider } from '@prisma/client';

@Injectable()
export class ConnectorRegistry {
  /**
   * Partial, not a complete mapping (UPD-BE-074): `zapier`/`make`/`n8n` are real
   * `IntegrationProvider` values but deliberately have no entry here — automation platforms
   * connect via a REST-Hook-style `OutboundWebhook` subscription, not this OAuth framework.
   */
  private readonly byProvider: Partial<Record<IntegrationProvider, Connector>>;

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
    linkedInAds: LinkedInAdsConnector,
    pinterestAds: PinterestAdsConnector,
    snapchatAds: SnapchatAdsConnector,
    microsoftAds: MicrosoftAdsConnector,
    amazonAds: AmazonAdsConnector,
    redditAds: RedditAdsConnector,
    quickBooks: QuickBooksConnector,
    xero: XeroConnector,
    shopify: ShopifyConnector,
    wooCommerce: WooCommerceConnector,
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
      [IntegrationProvider.linkedin_ads]: linkedInAds,
      [IntegrationProvider.pinterest_ads]: pinterestAds,
      [IntegrationProvider.snapchat_ads]: snapchatAds,
      [IntegrationProvider.microsoft_ads]: microsoftAds,
      [IntegrationProvider.amazon_ads]: amazonAds,
      [IntegrationProvider.reddit_ads]: redditAds,
      [IntegrationProvider.quickbooks]: quickBooks,
      [IntegrationProvider.xero]: xero,
      [IntegrationProvider.shopify]: shopify,
      [IntegrationProvider.woocommerce]: wooCommerce,
    };
  }

  get(provider: IntegrationProvider): Connector {
    const connector = this.byProvider[provider];
    if (!connector) {
      throw new Error(
        `No OAuth connector registered for provider "${provider}" — automation platforms (zapier/make/n8n) connect via OutboundWebhook subscriptions instead.`,
      );
    }
    return connector;
  }

  all(): IntegrationProvider[] {
    return Object.keys(this.byProvider) as IntegrationProvider[];
  }

  /** Providers whose connector implements `pushListing` (UPD-BE-041) — the real, non-hardcoded way to know which providers are "directories" for Business Listings sync. */
  directoryProviders(): IntegrationProvider[] {
    return this.all().filter(
      (provider) => typeof this.get(provider).pushListing === 'function',
    );
  }
}
