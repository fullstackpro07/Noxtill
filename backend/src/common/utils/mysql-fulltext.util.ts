/** MySQL boolean-mode operators — stripped from user input so they can't change search semantics. */
const BOOLEAN_MODE_OPERATORS = /[+\-~<>()"*@?!.,;:]/g;

/**
 * Builds a MySQL `MATCH() AGAINST(... IN BOOLEAN MODE)` query expression: strips boolean-mode
 * operator characters out of the raw user query, then builds one prefix-wildcard (`word*`) term
 * per remaining word for search-as-you-type matching. Returns `null` for a query with no real word
 * content (callers should skip the DB round-trip entirely in that case).
 *
 * `requireAll` controls whether every word is required (`+word*`, real AND semantics — the right
 * choice for short, deliberate search terms like a customer/product name, e.g. "John Doe" should
 * require both words) or optional (`word*`, real OR/relevance-ranked semantics — the right choice
 * for a natural-language question like help-doc retrieval, where most words in "When does the
 * frobnicator run?" are conversational filler that won't appear verbatim in the target document;
 * requiring every word there returns zero matches instead of ranking the best one). Defaults to
 * `true` since most callers are short structured search terms.
 *
 * Shared by `search.service.ts` and `help.service.ts` — see either for the real usage; this
 * replaced Postgres's `pg_trgm` `similarity()`/`ILIKE` when the project migrated to MySQL.
 */
export function buildFulltextBooleanQuery(
  query: string,
  requireAll = true,
): string | null {
  const words = query
    .replace(BOOLEAN_MODE_OPERATORS, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => (requireAll ? `+${word}*` : `${word}*`)).join(' ');
}
