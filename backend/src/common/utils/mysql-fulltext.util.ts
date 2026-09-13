/** MySQL boolean-mode operators — stripped from user input so they can't change search semantics. */
const BOOLEAN_MODE_OPERATORS = /[+\-~<>()"*@?!.,;:]/g;

/**
 * AI Assistant depth fix (UPD-INT-014): MySQL InnoDB's own default stopword list
 * (`INNODB_FT_DEFAULT_STOPWORD`). Filtered out here, in application code, BEFORE a word ever
 * becomes a `word*` prefix-wildcard boolean-mode term — the wildcard is what defeats MySQL's own
 * stopword filtering (`is*` matches "**is**sue", `an*` matches "**an**d"/"**an**swer", etc.), so a
 * natural-language question's filler words were spuriously prefix-matching real, unrelated words
 * in the corpus and getting returned as if they were relevant hits. Applying the same stopword
 * list ourselves, before wildcarding, closes that bypass at the root rather than trying to filter
 * results after the fact.
 */
const STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'are',
  'as',
  'at',
  'be',
  'by',
  'com',
  'de',
  'en',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'la',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'will',
  'with',
  'und',
  'www',
]);

/**
 * Builds a MySQL `MATCH() AGAINST(... IN BOOLEAN MODE)` query expression: strips boolean-mode
 * operator characters and real stopwords out of the raw user query, then builds one
 * prefix-wildcard (`word*`) term per remaining word for search-as-you-type matching. Returns
 * `null` for a query with no real word content (callers should skip the DB round-trip entirely in
 * that case).
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
    .filter(Boolean)
    .filter((word) => !STOPWORDS.has(word.toLowerCase()));
  if (words.length === 0) return null;
  return words.map((word) => (requireAll ? `+${word}*` : `${word}*`)).join(' ');
}
