import { buildFulltextBooleanQuery } from './mysql-fulltext.util';

describe('buildFulltextBooleanQuery (AI Assistant depth fix, UPD-INT-014)', () => {
  it('strips real stopwords out before wildcarding, in both requireAll modes', () => {
    expect(
      buildFulltextBooleanQuery('When does the frobnicator run?', false),
    ).toBe('does* frobnicator* run*');
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
