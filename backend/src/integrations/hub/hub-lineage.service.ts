import { Injectable } from '@nestjs/common';
import { HubProviderCard } from './hub.types';

export interface LineageNode {
  label: string;
  icon: string;
  /** App screen this step lives in, when it is one. */
  href: string | null;
}

export interface LineageChain {
  key: string;
  /** Catalog keys whose live state drives this chain's health. */
  providers: string[];
  title: string;
  icon: string;
  trigger: string;
  nodes: LineageNode[];
  note: string;
  health: { state: 'healthy' | 'attention' | 'not_connected'; label: string };
}

type ChainDef = Omit<LineageChain, 'health'>;

/**
 * Data lineage for the Business map. The *shape* of each chain is a statement about how this
 * codebase actually moves data, and each was checked against the code that does it:
 *  - store orders:  `EcommerceSyncService.importOrders` creates one `Order` (orderType online,
 *    deduped by provider+externalId). It does NOT create customers/payments or move stock — stock
 *    is reconciled separately by `reconcileStock`. Profit/Reports read every order regardless of type.
 *  - accounting:    `AccountingSyncService.sync` pushes completed orders as invoices via the
 *    `AccountingMapping` ledger accounts and stamps the order with the accounting reference.
 *  - directories:   `ListingSyncService.sync` pushes the Master Listing to each connected directory.
 *  - ad platforms:  campaigns are created through the connector and `AdStatsSyncProcessor`
 *    refreshes `AdCampaign.stats` hourly.
 *  - social:        provider webhooks land in `SocialInboxItem` (Social Inbox); replies go back out.
 *  - developer:     domain events go through `OutboundWebhookDispatchService` to signed, retried
 *    deliveries.
 * Health is derived live from the connection cards — a chain is only "Healthy" when every
 * connected provider on it is.
 */
const CHAINS: ChainDef[] = [
  {
    key: 'ecommerce',
    providers: ['shopify', 'woocommerce'],
    title: 'Online store',
    icon: 'shopping-bag',
    trigger:
      'An online order is placed, or stock differs between the store and Noxtill',
    nodes: [
      { label: 'Store order', icon: 'shopping-bag', href: null },
      { label: 'Noxtill order', icon: 'shopping-cart', href: '/orders' },
      {
        label: 'Profit & Analytics',
        icon: 'chart-no-axes-combined',
        href: '/profit',
      },
      { label: 'Reports', icon: 'file-bar-chart', href: '/reports' },
    ],
    note: 'One store order becomes exactly one Noxtill order (deduplicated by the store reference), so it is never counted twice. Stock is reconciled separately, by SKU, according to the connection’s source of truth.',
  },
  {
    key: 'ecommerce-stock',
    providers: ['shopify', 'woocommerce'],
    title: 'Store stock',
    icon: 'boxes',
    trigger:
      'A sync finds a different stock level in the store than in Noxtill',
    nodes: [
      { label: 'Store stock level', icon: 'boxes', href: null },
      {
        label: 'Source of truth',
        icon: 'shield-check',
        href: '/integrations/ecommerce',
      },
      { label: 'Products', icon: 'package', href: '/products' },
      { label: 'Inventory', icon: 'boxes', href: '/inventory' },
    ],
    note: 'Noxtill wins, the store wins, or the difference waits for you as a conflict — nothing is overwritten unless the setting says so, and every stock change is a recorded movement.',
  },
  {
    key: 'accounting',
    providers: ['quickbooks', 'xero'],
    title: 'Accounting',
    icon: 'receipt-text',
    trigger: 'A sale is completed in Noxtill and you post it',
    nodes: [
      { label: 'Noxtill sale', icon: 'shopping-cart', href: '/orders' },
      {
        label: 'Account mapping',
        icon: 'git-compare',
        href: '/integrations/accounting',
      },
      { label: 'Invoice', icon: 'receipt-text', href: null },
      { label: 'Ledger account', icon: 'book-open', href: null },
    ],
    note: 'Outbound only. Noxtill is the source of truth: the accounting provider receives what Noxtill records, never the reverse, and a sale with no mapped account is held back rather than posted to a guess.',
  },
  {
    key: 'directories',
    providers: ['gmb', 'bing_places', 'yelp', 'apple_business_connect'],
    title: 'Business listings',
    icon: 'map-pinned',
    trigger: 'You update your business details and sync',
    nodes: [
      { label: 'Master listing', icon: 'map-pinned', href: '/listings' },
      { label: 'Directory sync', icon: 'refresh-cw', href: null },
      { label: 'Live directory listing', icon: 'globe', href: null },
    ],
    note: 'One master listing is pushed to every connected directory, so a change is made once. Each push is logged with its outcome.',
  },
  {
    key: 'ads',
    providers: [
      'google_ads',
      'meta_ads',
      'microsoft_ads',
      'tiktok_ads',
      'linkedin_ads',
      'pinterest_ads',
      'snapchat_ads',
      'amazon_ads',
      'reddit_ads',
    ],
    title: 'Advertising',
    icon: 'target',
    trigger: 'A campaign is created in Noxtill, then stats refresh hourly',
    nodes: [
      { label: 'Noxtill campaign', icon: 'target', href: '/advertising' },
      { label: 'Ad platform', icon: 'megaphone', href: null },
      {
        label: 'Spend and results',
        icon: 'chart-no-axes-combined',
        href: '/advertising',
      },
    ],
    note: 'Campaigns are created through the platform’s own API and their spend and results are pulled back into Advertising every hour.',
  },
  {
    key: 'social',
    providers: [
      'facebook',
      'instagram',
      'linkedin',
      'tiktok',
      'pinterest',
      'twitter',
      'youtube',
      'snapchat',
      'threads',
      'reddit',
      'tumblr',
      'telegram',
      'discord',
      'wechat',
      'line',
    ],
    title: 'Social accounts',
    icon: 'share-2',
    trigger: 'A customer messages or comments on a connected account',
    nodes: [
      { label: 'Social message', icon: 'message-circle', href: null },
      { label: 'Social Inbox', icon: 'message-square', href: '/social/inbox' },
      { label: 'Reply sent back', icon: 'send', href: '/social/inbox' },
    ],
    note: 'Messages arrive through the platform’s webhook and are stored once. A reply goes back out through the same connection.',
  },
  {
    key: 'automation',
    providers: ['zapier', 'make', 'n8n', 'webhooks'],
    title: 'Automation and webhooks',
    icon: 'workflow',
    trigger:
      'A sale, booking, review, low stock, credit or customer event happens in Noxtill',
    nodes: [
      { label: 'Noxtill event', icon: 'zap', href: null },
      {
        label: 'Signed delivery',
        icon: 'webhook',
        href: '/integrations/developer',
      },
      { label: 'Your endpoint or platform', icon: 'workflow', href: null },
    ],
    note: 'Every delivery is signed, retried with backoff and keeps its outcome, so a failing endpoint shows up here instead of being silently dropped.',
  },
];

@Injectable()
export class HubLineageService {
  chains(cards: HubProviderCard[]): LineageChain[] {
    const byKey = new Map(cards.map((c) => [c.key, c]));
    return CHAINS.map((chain) => {
      const mine = chain.providers
        .map((k) => byKey.get(k))
        .filter((c): c is HubProviderCard => !!c);
      const connected = mine.filter((c) => c.status !== 'not_connected');
      const troubled = connected.filter((c) => c.status === 'needs_attention');
      const health: LineageChain['health'] =
        connected.length === 0
          ? { state: 'not_connected', label: 'Not connected' }
          : troubled.length > 0
            ? {
                state: 'attention',
                label:
                  troubled[0].attention[0]?.text ??
                  `${troubled[0].name} needs attention`,
              }
            : { state: 'healthy', label: 'Healthy' };
      return { ...chain, health };
    });
  }
}
