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
  ],
  exports: [
    IntegrationsService,
    ConnectorRegistry,
    TokenCipherService,
    GmbConnector,
  ],
})
export class IntegrationsModule {}
