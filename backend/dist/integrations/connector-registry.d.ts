import { Connector } from './connector.interface';
import { GmbConnector } from './connectors/gmb.connector';
import { GoogleAdsConnector } from './connectors/google-ads.connector';
import { MerchantCenterConnector } from './connectors/merchant-center.connector';
import { MetaAdsConnector } from './connectors/meta-ads.connector';
import { TikTokAdsConnector } from './connectors/tiktok-ads.connector';
import { EmailConnector } from './connectors/email.connector';
import { IntegrationProvider } from '../../generated/prisma';
export declare class ConnectorRegistry {
    private readonly byProvider;
    constructor(gmb: GmbConnector, googleAds: GoogleAdsConnector, merchant: MerchantCenterConnector, metaAds: MetaAdsConnector, tiktokAds: TikTokAdsConnector, email: EmailConnector);
    get(provider: IntegrationProvider): Connector;
    all(): IntegrationProvider[];
}
