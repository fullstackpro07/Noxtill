import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { ConnectorRegistry } from './connector-registry';
import { TokenCipherService } from './token-cipher.service';
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
import { EmailCampaignsModule } from './email/email-campaigns.module';

@Module({
  imports: [EmailCampaignsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    ConnectorRegistry,
    TokenCipherService,
    GmbConnector,
    GoogleAdsConnector,
    MerchantCenterConnector,
    MetaAdsConnector,
    TikTokAdsConnector,
    EmailConnector,
    BingPlacesConnector,
    YelpConnector,
    AppleBusinessConnectConnector,
    LinkedInAdsConnector,
    PinterestAdsConnector,
    SnapchatAdsConnector,
    MicrosoftAdsConnector,
    AmazonAdsConnector,
    RedditAdsConnector,
    QuickBooksConnector,
    XeroConnector,
    ShopifyConnector,
    WooCommerceConnector,
  ],
  exports: [
    IntegrationsService,
    ConnectorRegistry,
    TokenCipherService,
    GmbConnector,
  ],
})
export class IntegrationsModule {}
