import * as fs from 'fs';
import * as path from 'path';
import { KIND_TO_OPERATION } from './usage.constants';

/**
 * Spec §8.1 CI check: "a feature that calls a model and is not in the registry is a bug".
 * Metering is enforced at the AiInfraService chokepoint (which also covers background jobs,
 * webhooks and the public API), so this guards the two ways metering could silently decay:
 *   1. a call site passes an AI `kind` that has no credit operation, and
 *   2. a file calls the model clients directly instead of going through AiInfraService.
 */
const SRC = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** Top-level comma split of a call's argument text. */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** Position of the `kind` argument for each AiInfraService method. */
const KIND_ARG: Record<string, number> = {
  complete: 3,
  createMessage: 1,
  checkGuardrails: 1,
  recordUsage: 1,
  reserveCredits: 1,
};

describe('AI metering coverage (spec §8.1)', () => {
  const files = walk(SRC);

  it('every literal AI kind passed to AiInfraService has a credit operation (or an own meter)', () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      if (
        !/AiInfraService/.test(src) ||
        file.endsWith(path.join('ai', 'ai-infra.service.ts'))
      )
        continue;
      const re =
        /\.(complete|createMessage|checkGuardrails|recordUsage|reserveCredits)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        let i = m.index + m[0].length;
        let depth = 1;
        const start = i;
        while (i < src.length && depth) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          i++;
        }
        const arg = splitArgs(src.slice(start, i - 1))[KIND_ARG[m[1]]];
        const literal = arg?.match(/^'([a-z_]+)'$/)?.[1];
        if (literal && !(literal in KIND_TO_OPERATION))
          missing.push(`${path.relative(SRC, file)}: ${literal}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('only allow-listed files call the model clients directly', () => {
    // Each of these meters its own usage: AiInfraService itself, the assistant's streamed turn
    // (reserves/commits through AiInfraService), live voice (billed as call minutes), Whisper
    // transcription (its own meter) and the pre-signup business-type mapper (no business yet).
    const allow = [
      'ai/ai-infra.service.ts',
      'ai/claude.client.ts',
      'ai/speech-to-text.service.ts',
      'assistant/assistant.service.ts',
      'customer-import/customer-import.parser.ts',
      'voice/voice-realtime.gateway.ts',
      'voice/voice-realtime-sandbox.service.ts',
    ].map((p) => path.normalize(p));
    const offenders = files
      .filter((f) => !allow.includes(path.normalize(path.relative(SRC, f))))
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return /this\.claude\.(complete|createMessage|streamMessage)\(|api\.anthropic\.com|api\.openai\.com\/v1\/(chat|responses|images)/.test(
          src,
        );
      })
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
