import * as fs from 'fs';
import * as path from 'path';
import { KIND_TO_OPERATION } from '../../usage/usage.constants';
import {
  KIND_TO_AI_OPERATION,
  OPERATIONS,
  SPECIALISED,
  resolveRoute,
} from './ai-operations';
import { PRICES, SERVICES, TIERS } from './ai-routing.config';

/**
 * AI Model Routing spec §5.4 / §8 CI check: "No file outside `ai/` contains a provider or model
 * name". Runs in `npm test`, so CI fails the build when a feature names a model.
 *
 * What counts as naming one: a model-ID literal, a provider API host, or an `'openai'` /
 * `'anthropic'` provider literal. `'google'` cannot be banned outright — Google sign-in, Ads,
 * Places and Business Profile use it legitimately — so the Gemini host and model IDs are banned
 * instead.
 */
const SRC = path.join(__dirname, '..', '..');

/** Spec §4 realtime audio talks to the OpenAI Realtime API directly (sub-second latency). */
const ALLOW = [
  'voice/voice-realtime.gateway.ts',
  'voice/voice-realtime.protocol.ts',
  'voice/voice-realtime.service.ts',
  'voice/voice-realtime-sandbox.service.ts',
].map((p) => path.normalize(p));

const BANNED: [string, RegExp][] = [
  [
    'model id',
    /['"`](?:claude-(?:haiku|sonnet|opus|3|instant)|gpt-\d|gemini-\d|whisper-\d|dall-e)[^'"`]*['"`]/i,
  ],
  [
    'provider API host',
    /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/,
  ],
  ['provider literal', /['"`](?:openai|anthropic)['"`]/],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** Strip comments so prose about providers in docs/comments doesn't trip the check. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('AI provider isolation (routing spec §8)', () => {
  it('no file outside src/ai/ names a model, provider host or provider', () => {
    const aiDir = path.join(SRC, 'ai') + path.sep;
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.startsWith(aiDir)) continue;
      const rel = path.normalize(path.relative(SRC, file));
      if (ALLOW.includes(rel)) continue;
      const src = code(fs.readFileSync(file, 'utf8'));
      for (const [what, re] of BANNED) {
        const m = src.match(re);
        if (m) offenders.push(`${rel}: ${what} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every credit-billed AI kind resolves to a registered operation', () => {
    // Not language-model calls through the router:
    //  complete       — generic credit bucket; the router deliberately refuses it
    //  generate_image — image model, handled inside src/ai
    //  voice_realtime — spec §4 realtime audio (guardrail check only)
    const notRouted = new Set(['complete', 'generate_image', 'voice_realtime']);
    const unrouted = Object.keys(KIND_TO_OPERATION).filter(
      (kind) => !notRouted.has(kind) && !(kind in KIND_TO_AI_OPERATION),
    );
    expect(unrouted).toEqual([]);
  });

  it('the registry has exactly the 43 official operations, each on a configured tier', () => {
    expect(Object.keys(OPERATIONS)).toHaveLength(43);
    for (const tier of Object.values(OPERATIONS))
      expect(TIERS[tier]).toBeDefined();
    for (const op of Object.values(KIND_TO_AI_OPERATION))
      expect(op in OPERATIONS || op in SPECIALISED).toBe(true);
  });

  it('every configured model has a price', () => {
    const models = [
      ...Object.values(TIERS),
      ...Object.values(SERVICES),
    ].flatMap((r) => [r.primary.model, r.fallback.model]);
    for (const m of models) expect(PRICES[m]).toBeDefined();
  });

  it('fallback is always the other provider (spec §3)', () => {
    for (const r of [...Object.values(TIERS), ...Object.values(SERVICES)])
      expect(r.fallback.provider).not.toBe(r.primary.provider);
  });

  it('an unregistered kind throws before any provider is contacted', () => {
    expect(() => resolveRoute('complete')).toThrow(/not registered/);
    expect(() => resolveRoute('made_up_kind')).toThrow(/not registered/);
  });
});
