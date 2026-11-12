import type { CreateMessageResult } from '../ai-message.types';

/** First text block of a model result, with any markdown code fence removed. */
export function resultText(result: CreateMessageResult): string {
  const text = result.content.find((b) => b.type === 'text')?.text ?? '';
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Structural check for call sites that expect JSON (spec §5.3). Passed as
 * `CreateMessageParams.validate`: unparseable output — or output the optional `check` rejects —
 * makes the router try the fallback model instead of returning bad data.
 *
 * Only the outermost JSON object/array in the text is parsed, so a model that adds a sentence
 * around the payload still passes; call sites keep their own (more specific) parsing.
 */
export function expectJson(
  check?: (value: unknown) => boolean,
): (result: CreateMessageResult) => void {
  return (result) => {
    const text = resultText(result);
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start < 0 || end < start)
      throw new Error('AI output did not contain JSON');
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    if (check && !check(value))
      throw new Error('AI output JSON did not have the expected shape');
  };
}
