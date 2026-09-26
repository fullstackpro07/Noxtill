import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { CatalogProductInput, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

/** Google Merchant Center connector (BE-086), via the Content API for Shopping. */
@Injectable()
export class MerchantCenterConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.merchant;
  protected readonly scope = 'https://www.googleapis.com/auth/content';

  constructor(config: ConfigService) {
    super(config);
  }

  /** authinfo returns the merchant accounts the connected identity has access to. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /** The merchant id the connected identity manages (first account from `authinfo`). */
  private async merchantId(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<string> {
    if (typeof meta.merchantId === 'string' && meta.merchantId)
      return meta.merchantId;
    const info = (await this.sync(tokens)) as {
      accountIdentifiers?: Array<{ merchantId?: string }>;
    };
    const id = info.accountIdentifiers?.find((a) => a.merchantId)?.merchantId;
    if (!id)
      throw new Error('This Google account manages no Merchant Center account');
    return id;
  }

  /**
   * Publishes catalog products with the Content API's `products.insert` (which inserts or updates
   * by `offerId`). Products Google would reject — no link, no image — fail individually with the
   * reason, so one bad product never blocks the rest.
   */
  async pushProducts(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    products: CatalogProductInput[],
  ): Promise<{ pushed: number; failed: number; errors: string[] }> {
    const merchantId = await this.merchantId(tokens, meta);
    const errors: string[] = [];
    let pushed = 0;
    let failed = 0;
    for (const p of products) {
      try {
        await axios.post(
          `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`,
          {
            offerId: p.sku,
            title: p.title,
            description: p.description ?? p.title,
            link: p.link,
            imageLink: p.imageLink,
            contentLanguage: 'en',
            targetCountry: (meta.targetCountry as string | undefined) ?? 'US',
            channel: 'online',
            availability: p.inStock ? 'in stock' : 'out of stock',
            condition: 'new',
            price: { value: p.price.toFixed(2), currency: p.currency },
          },
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        );
        pushed += 1;
      } catch (error) {
        failed += 1;
        const detail =
          (error as { response?: { data?: { error?: { message?: string } } } })
            .response?.data?.error?.message ?? (error as Error).message;
        errors.push(`${p.sku}: ${detail}`);
      }
    }
    return { pushed, failed, errors };
  }
}
