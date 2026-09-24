/**
 * What the receptionist's AI records about each turn it answers, and how a whole call is summarised
 * from those turns. Everything here is a value the model actually returned for that turn (or `null`
 * when it returned nothing usable) — no field is ever filled in with a default guess, so a missing
 * reading shows as "not recorded" rather than as a confident-looking number.
 */

/** The fixed taxonomy the AI files a caller's question under. Keys are stored; labels are what people read. */
export const TOPICS = {
  booking_availability: 'Booking availability',
  opening_hours: 'Opening hours',
  location: 'Location and directions',
  product_price_stock: 'Product price and stock',
  service_pricing: 'Service price and duration',
  order_status: 'Order status',
  credit_balance: 'Credit balance',
  refund_returns: 'Refund and returns',
  complaint: 'Complaint',
  other: 'Something else',
} as const;

export type TopicKey = keyof typeof TOPICS;

export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];

export type Confidence = 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];
const SENTIMENTS: Sentiment[] = [
  'positive',
  'neutral',
  'negative',
  'frustrated',
];

/** Worst-first, so a call's overall reading is the most negative moment on it. */
const SENTIMENT_SEVERITY: Record<Sentiment, number> = {
  positive: 0,
  neutral: 1,
  negative: 2,
  frustrated: 3,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

export interface TurnAnalysis {
  /** The intent the AI chose for this turn (a built-in one, or the name of a custom situation). */
  intent: string;
  confidence: Confidence | null;
  /** The AI's estimate of how the CALLER sounded on the turn it is replying to. An estimate, not a fact. */
  sentiment: Sentiment | null;
  /** What the caller's question was about, or null when they weren't asking anything topical. */
  topic: TopicKey | null;
  /**
   * `true` — the AI answered a factual question from the records it was given.
   * `false` — it had to say it doesn't have that information.
   * `null` — the turn wasn't a factual question, or the model didn't say.
   */
  answered: boolean | null;
  /** The record blocks that were put in front of the AI on this turn. Not proof the reply used them. */
  sources: string[];
  /** Set when the server, not the AI, decided what happened next — a routing rule or a safety guard. */
  routedBy?: string;
}

export interface RawAiAnalysis {
  confidence?: unknown;
  sentiment?: unknown;
  topic?: unknown;
  answered?: unknown;
}

export function normalizeConfidence(value: unknown): Confidence | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (CONFIDENCES as string[]).includes(v) ? (v as Confidence) : null;
}

export function normalizeSentiment(value: unknown): Sentiment | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (SENTIMENTS as string[]).includes(v) ? (v as Sentiment) : null;
}

export function normalizeTopic(value: unknown): TopicKey | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (TOPIC_KEYS as string[]).includes(v) ? (v as TopicKey) : null;
}

export function normalizeAnswered(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/** A name is kept only when it looks like one: short, no digits, no `@`. */
export function cleanCallerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().replace(/\s+/g, ' ');
  if (v.length < 2 || v.length > 60) return null;
  if (/[0-9@<>]/.test(v)) return null;
  return v;
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** An email is kept only when it is syntactically an email address — speech-to-text errors are dropped, not repaired. */
export function cleanCallerEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v.length <= 120 && EMAIL_RE.test(v) ? v : null;
}

export function buildTurnAnalysis(
  raw: RawAiAnalysis,
  intent: string,
  sources: string[],
): TurnAnalysis {
  return {
    intent,
    confidence: normalizeConfidence(raw.confidence),
    sentiment: normalizeSentiment(raw.sentiment),
    topic: normalizeTopic(raw.topic),
    answered: normalizeAnswered(raw.answered),
    sources,
  };
}

interface AnalysedTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
  analysis?: TurnAnalysis;
}

export interface CallQuestion {
  topic: TopicKey;
  /** What the caller said just before the AI answered (or declined). */
  text: string;
  answered: boolean | null;
  at: string;
}

export interface CallAnalysis {
  /** The lowest confidence the AI reported on any turn, or null if it reported none. */
  confidence: Confidence | null;
  lowConfidenceTurns: number;
  /** The most negative reading of the caller on any turn, or null if none was reported. */
  sentiment: Sentiment | null;
  /** The last topic the AI filed a question under. */
  topic: TopicKey | null;
  questions: CallQuestion[];
  declinedCount: number;
}

/** Rolls a call's per-turn readings up into the few figures the workspace and the roll-ups need. */
export function summariseCallAnalysis(turns: AnalysedTurn[]): CallAnalysis {
  let confidence: Confidence | null = null;
  let sentiment: Sentiment | null = null;
  let topic: TopicKey | null = null;
  let lowConfidenceTurns = 0;
  const questions: CallQuestion[] = [];

  turns.forEach((turn, i) => {
    const a = turn.analysis;
    if (turn.speaker !== 'assistant' || !a) return;
    if (a.confidence) {
      if (
        confidence === null ||
        CONFIDENCE_RANK[a.confidence] < CONFIDENCE_RANK[confidence]
      ) {
        confidence = a.confidence;
      }
      if (a.confidence === 'low') lowConfidenceTurns += 1;
    }
    if (a.sentiment) {
      if (
        sentiment === null ||
        SENTIMENT_SEVERITY[a.sentiment] > SENTIMENT_SEVERITY[sentiment]
      ) {
        sentiment = a.sentiment;
      }
    }
    if (a.topic) {
      topic = a.topic;
      const said = [...turns.slice(0, i)]
        .reverse()
        .find((t) => t.speaker === 'caller');
      questions.push({
        topic: a.topic,
        text: said?.text ?? '',
        answered: a.answered,
        at: turn.at,
      });
    }
  });

  return {
    confidence,
    lowConfidenceTurns,
    sentiment,
    topic,
    questions,
    declinedCount: questions.filter((q) => q.answered === false).length,
  };
}
