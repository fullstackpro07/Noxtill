import {
  buildTurnAnalysis,
  cleanCallerEmail,
  cleanCallerName,
  normalizeAnswered,
  normalizeConfidence,
  normalizeSentiment,
  normalizeTopic,
  summariseCallAnalysis,
} from './voice-analysis';

describe('voice-analysis (AI Phone, full — pure helpers)', () => {
  describe('normalizeConfidence/Sentiment/Topic/Answered', () => {
    it('accepts only the exact known values, case-insensitively', () => {
      expect(normalizeConfidence('HIGH')).toBe('high');
      expect(normalizeConfidence('extreme')).toBeNull();
      expect(normalizeConfidence(undefined)).toBeNull();
      expect(normalizeSentiment('Frustrated')).toBe('frustrated');
      expect(normalizeSentiment('angry')).toBeNull();
      expect(normalizeTopic('order_status')).toBe('order_status');
      expect(normalizeTopic('weather')).toBeNull();
      expect(normalizeAnswered(true)).toBe(true);
      expect(normalizeAnswered('false')).toBe(false);
      expect(normalizeAnswered('maybe')).toBeNull();
    });
  });

  describe('cleanCallerName/Email', () => {
    it('keeps a plausible name and rejects things that are not one', () => {
      expect(cleanCallerName('Ayesha Khan')).toBe('Ayesha Khan');
      expect(cleanCallerName('')).toBeNull();
      expect(cleanCallerName('a')).toBeNull();
      expect(cleanCallerName('Room 402')).toBeNull(); // contains a digit
      expect(cleanCallerName(undefined)).toBeNull();
    });

    it('keeps only a syntactically valid email', () => {
      expect(cleanCallerEmail('ayesha@example.com')).toBe('ayesha@example.com');
      expect(cleanCallerEmail('AYESHA@Example.COM')).toBe('ayesha@example.com');
      expect(cleanCallerEmail('not an email')).toBeNull();
      expect(cleanCallerEmail(undefined)).toBeNull();
    });
  });

  describe('summariseCallAnalysis', () => {
    it('rolls per-turn readings up to the worst confidence and sentiment seen', () => {
      const turns = [
        { speaker: 'caller' as const, text: 'Are you open on Eid?', at: '1' },
        {
          speaker: 'assistant' as const,
          text: "I don't have that.",
          at: '2',
          analysis: buildTurnAnalysis(
            {
              confidence: 'high',
              sentiment: 'neutral',
              topic: 'opening_hours',
              answered: false,
            },
            'continue',
            [],
          ),
        },
        { speaker: 'caller' as const, text: 'That is annoying.', at: '3' },
        {
          speaker: 'assistant' as const,
          text: 'I will take a message.',
          at: '4',
          analysis: buildTurnAnalysis(
            {
              confidence: 'low',
              sentiment: 'frustrated',
              topic: undefined,
              answered: undefined,
            },
            'message',
            ['Business hours'],
          ),
        },
      ];
      const result = summariseCallAnalysis(turns);
      expect(result.confidence).toBe('low'); // worst of high/low
      expect(result.sentiment).toBe('frustrated'); // worst of neutral/frustrated
      expect(result.lowConfidenceTurns).toBe(1);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        topic: 'opening_hours',
        text: 'Are you open on Eid?',
        answered: false,
      });
      expect(result.declinedCount).toBe(1);
    });

    it('returns nulls, not guesses, when no turn carried any analysis', () => {
      const result = summariseCallAnalysis([
        { speaker: 'caller' as const, text: 'Hello', at: '1' },
        { speaker: 'assistant' as const, text: 'Hi', at: '2' },
      ]);
      expect(result.confidence).toBeNull();
      expect(result.sentiment).toBeNull();
      expect(result.questions).toEqual([]);
      expect(result.declinedCount).toBe(0);
    });
  });
});
