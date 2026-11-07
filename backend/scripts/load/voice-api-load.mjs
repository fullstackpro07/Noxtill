#!/usr/bin/env node
/**
 * Module 21 API load check. Signs up a throw-away QA business on the target API, then runs N
 * concurrent virtual users for D seconds against the main read endpoints the phone screens poll.
 * Reports per-endpoint request count, error rate, rate-limited count, p50/p95/p99 latency and
 * overall throughput. 5xx/network failures exit with code 2; 429s are reported separately.
 *
 *   node scripts/load/voice-api-load.mjs [--api http://127.0.0.1:5001/api/v1] [--users 20] [--seconds 30]
 *
 * Never run against production without approval: it creates a QA business and real traffic.
 * It only issues GET requests after signup, so it places no calls and sends no messages.
 */
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const API = arg('api', process.env.LOAD_API_URL ?? 'http://127.0.0.1:5001/api/v1');
const USERS = Number(arg('users', 20));
const SECONDS = Number(arg('seconds', 30));
const ENDPOINTS = [
  '/voice/insights?days=30',
  '/voice/calls',
  '/voice/callbacks',
  '/voice/analytics/trends?days=30',
  '/voice/settings/usage',
  '/voice/campaigns',
  '/voice/tracking/overview?days=30',
  '/health/ready',
];

const stamp = Date.now();
const signup = await fetch(`${API}/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    businessName: `Load QA ${stamp}`,
    name: 'Load QA Owner',
    email: `load-qa-${stamp}@example.com`,
    password: `Load-${stamp}-Pass!`,
    country: 'US',
    currency: 'USD',
  }),
});
if (!signup.ok) {
  console.error('Signup failed', signup.status, await signup.text());
  process.exit(1);
}
const { accessToken } = await signup.json();
const headers = { Authorization: `Bearer ${accessToken}` };
const modules = await (await fetch(`${API}/business-modules`, { headers })).json();
await fetch(`${API}/business-modules/selection`, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: modules.modules.map((m) => m.key) }),
});

const stats = new Map(ENDPOINTS.map((e) => [e, { times: [], errors: 0, throttled: 0, statuses: {} }]));
const deadline = Date.now() + SECONDS * 1000;
let cursor = 0;

async function user() {
  while (Date.now() < deadline) {
    const endpoint = ENDPOINTS[cursor++ % ENDPOINTS.length];
    const s = stats.get(endpoint);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}${endpoint}`, { headers });
      await res.arrayBuffer();
      s.times.push(performance.now() - t0);
      s.statuses[res.status] = (s.statuses[res.status] ?? 0) + 1;
      if (res.status >= 500) s.errors += 1;
      if (res.status === 429) s.throttled += 1;
    } catch {
      s.errors += 1;
    }
  }
}

console.log(`Load: ${USERS} users x ${SECONDS}s against ${API}`);
const started = Date.now();
await Promise.all(Array.from({ length: USERS }, user));
const elapsed = (Date.now() - started) / 1000;

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN);
let total = 0;
let totalErrors = 0;
let totalThrottled = 0;
const rows = [];
for (const [endpoint, s] of stats) {
  const sorted = [...s.times].sort((a, b) => a - b);
  total += sorted.length;
  totalErrors += s.errors;
  totalThrottled += s.throttled;
  rows.push({
    endpoint,
    requests: sorted.length,
    errorRate: sorted.length ? `${((s.errors / sorted.length) * 100).toFixed(1)}%` : 'n/a',
    throttled: s.throttled,
    p50ms: Math.round(pct(sorted, 50)),
    p95ms: Math.round(pct(sorted, 95)),
    p99ms: Math.round(pct(sorted, 99)),
    statuses: JSON.stringify(s.statuses),
  });
}
console.table(rows);
console.log(`Total ${total} requests in ${elapsed.toFixed(1)}s (${(total / elapsed).toFixed(1)} req/s), ${totalErrors} errors (5xx/network), ${totalThrottled} rate-limited (429).`);
if (totalThrottled) {
  console.log('429s are the per-business rate limit working. For server capacity numbers, run against an environment started with a higher API_RATE_LIMIT_PER_MINUTE.');
}
process.exit(totalErrors > 0 ? 2 : 0);
