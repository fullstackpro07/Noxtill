import { buildFulltextBooleanQuery } from './mysql-fulltext.util';

describe('buildFulltextBooleanQuery (AI Assistant depth fix, UPD-INT-014)', () => {
  it('strips real stopwords out before wildcarding, in both requireAll modes', () => {
    expect(
      buildFulltextBooleanQuery('When does the frobnicator run?', false),
    ).toBe('frobnicator* run*');
    expect(
      buildFulltextBooleanQuery(
        'What is the airspeed velocity of an unladen swallow?',
        false,
      ),
    ).toBe('airspeed* velocity* unladen* swallow*');
    expect(buildFulltextBooleanQuery('the John Doe', true)).toBe(
      '+John* +Doe*',
    );
  });

  it('also drops question filler words in question mode only, so "and"/"up" cannot prefix-match unrelated articles', () => {
    expect(
      buildFulltextBooleanQuery('How do coupons and vouchers differ?', false),
    ).toBe('coupons* vouchers* differ*');
    expect(
      buildFulltextBooleanQuery('How do I set up a nightly close?', false),
    ).toBe('nightly* close*');
    // A short structured search (requireAll) keeps every real word — "Set" and "and" can be part of a name.
    expect(buildFulltextBooleanQuery('Salt and Pepper', true)).toBe(
      '+Salt* +and* +Pepper*',
    );
  });

  it('returns null when only stopwords/operators remain, so callers can skip the DB round-trip', () => {
    expect(buildFulltextBooleanQuery('What is this?', false)).toBeNull();
    expect(buildFulltextBooleanQuery('   ', false)).toBeNull();
  });

  it('still strips boolean-mode operator characters out of raw user input', () => {
    expect(buildFulltextBooleanQuery('frobnicator+widget -test', false)).toBe(
      'frobnicator* widget* test*',
    );
  });
});
