#!/usr/bin/env node
/**
 * Read-only platform reconciliation: Twilio's own monthly usage records for the shared account vs.
 * the sum of Noxtill's voice usage ledger (all businesses) for the same UTC month.
 *
 *   node --env-file=.env scripts/billing/reconcile-twilio-usage.mjs --month 2026-09
 *
 * Twilio usage is account-wide, so this is a platform check, not a per-business invoice. A gap
 * means callbacks were missed, test traffic ran outside the app, or rounding differs; investigate
 * before billing. Nothing is written anywhere.
 */
import { PrismaClient } from '@prisma/client';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const month = arg('month');
if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  console.error('Usage: --month YYYY-MM');
  process.exit(1);
}
const [year, mon] = month.split('-').map(Number);
const start = new Date(Date.UTC(year, mon - 1, 1));
const end = new Date(Date.UTC(year, mon, 1));
const day = (d) => d.toISOString().slice(0, 10);

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
if (!sid || !token) {
  console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set; nothing to reconcile against.');
  process.exit(1);
}

// Twilio category -> ledger unit, and how to compare quantities.
const PAIRS = [
  { category: 'calls-inbound', unit: 'inbound_provider_seconds', twilioQty: 'usage', twilioUnit: 'minutes', toTwilio: (q) => q / 60 },
  { category: 'calls-outbound', unit: 'outbound_provider_seconds', twilioQty: 'usage', twilioUnit: 'minutes', toTwilio: (q) => q / 60 },
  { category: 'sms-outbound', unit: 'outbound_sms_segments', twilioQty: 'usage', twilioUnit: 'segments', toTwilio: (q) => q },
  { category: 'phonenumbers', unit: 'phone_number_months', twilioQty: 'count', twilioUnit: 'numbers', toTwilio: (q) => q },
];

const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records.json?StartDate=${day(start)}&EndDate=${day(new Date(end.getTime() - 86_400_000))}&PageSize=1000`;
const response = await fetch(url, { headers: { Authorization: auth } });
if (!response.ok) {
  console.error('Twilio usage request failed', response.status);
  process.exit(1);
}
const { usage_records: records = [] } = await response.json();
const byCategory = new Map(records.map((r) => [r.category, r]));

const prisma = new PrismaClient();
const ledger = await prisma.voiceUsageRecord.groupBy({
  by: ['unit', 'currency'],
  where: { provider: 'twilio', measuredAt: { gte: start, lt: end } },
  _sum: { quantity: true, cost: true },
  _count: { _all: true },
});
await prisma.$disconnect();

const rows = PAIRS.map((pair) => {
  const twilio = byCategory.get(pair.category);
  const mine = ledger.filter((l) => l.unit === pair.unit);
  const quantity = mine.reduce((s, l) => s + Number(l._sum.quantity ?? 0), 0);
  const cost = mine.reduce((s, l) => s + Number(l._sum.cost ?? 0), 0);
  const twilioQty = twilio ? Number(twilio[pair.twilioQty] ?? 0) : null;
  const twilioPrice = twilio ? Number(twilio.price ?? 0) : null;
  const ledgerQty = pair.toTwilio(quantity);
  return {
    category: pair.category,
    unit: pair.twilioUnit,
    twilio: twilioQty,
    ledger: Number(ledgerQty.toFixed(2)),
    qtyGap: twilioQty === null ? 'n/a' : Number((twilioQty - ledgerQty).toFixed(2)),
    twilioPrice: twilioPrice === null ? 'n/a' : `${twilioPrice.toFixed(4)} ${twilio?.price_unit ?? ''}`.trim(),
    ledgerCost: cost.toFixed(4),
    ledgerRows: mine.reduce((s, l) => s + l._count._all, 0),
  };
});

console.log(`Twilio vs Noxtill ledger for ${month} (UTC). Twilio figures are account-wide.`);
console.table(rows);
console.log('Ledger cost includes confirmed provider prices and estimated list prices; Twilio price is its own usage figure, not a tax invoice.');
