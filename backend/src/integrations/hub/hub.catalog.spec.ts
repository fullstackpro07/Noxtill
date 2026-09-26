import 'reflect-metadata';
import { Connector } from '../connector.interface';
import { ConnectorRegistry } from '../connector-registry';
import { HUB_CATALOG } from './hub.catalog';

const READS = [
  'fetchListing',
  'fetchCampaignStats',
  'fetchProducts',
  'fetchOrders',
  'fetchPayments',
  'fetchTraffic',
] as const;
const WRITES = [
  'pushListing',
  'pushPhoto',
  'createCampaign',
  'updateCampaign',
  'pushInvoice',
  'pushInventory',
  'pushProducts',
  'pushContacts',
  'createCalendarEvent',
  'updateCalendarEvent',
  'deleteCalendarEvent',
  'createMeeting',
  'postMessage',
] as const;

// Providers whose direction is carried by something other than the optional capability methods
// (email is send-only through EmailService; WhatsApp is a chat channel in both directions).
const NON_CAPABILITY = new Set(['email', 'whatsapp']);

function registry(): ConnectorRegistry {
  const types = Reflect.getMetadata(
    'design:paramtypes',
    ConnectorRegistry,
  ) as Array<{ prototype: object }>;
  const Ctor = ConnectorRegistry as unknown as new (
    ...args: unknown[]
  ) => ConnectorRegistry;
  return new Ctor(...types.map((t) => Object.create(t.prototype) as unknown));
}

describe('hub catalog is honest about each connector', () => {
  const reg = registry();

  const integrationDefs = HUB_CATALOG.filter(
    (d) => d.source.type === 'integration' && !NON_CAPABILITY.has(d.key),
  );

  it.each(integrationDefs.map((d) => [d.key, d] as const))(
    '%s direction matches the connector capabilities',
    (_key, def) => {
      if (def.source.type !== 'integration') return;
      let connector: Connector | undefined;
      try {
        connector = reg.get(def.source.provider);
      } catch {
        connector = undefined;
      }
      // Automation platforms (Zapier/Make/n8n) have no connector — they are webhook subscriptions.
      if (def.connectKind === 'automation') {
        expect(connector).toBeUndefined();
        return;
      }
      expect(connector).toBeDefined();
      if (!connector) return;
      const c = connector as unknown as Record<string, unknown>;
      const reads = READS.some((m) => typeof c[m] === 'function');
      const writes = WRITES.some((m) => typeof c[m] === 'function');
      const expected =
        reads && writes ? 'Two-way' : reads ? 'Inbound' : 'Outbound';
      expect(def.direction).toBe(expected);
    },
  );

  it('no social platform claims a direct-message inbox in its benefit text', () => {
    for (const d of HUB_CATALOG.filter((x) => x.source.type === 'social')) {
      if (d.connectKind === 'social-token') continue;
      expect(d.benefit.toLowerCase()).not.toContain('direct message');
      expect(d.permissions.toLowerCase()).not.toContain('read messages');
    }
  });

  it('catalog keys are unique', () => {
    const keys = HUB_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
