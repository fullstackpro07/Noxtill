/** Quantities with live-usage evidence; bookkeeping, samples and aggregate cost receipts are excluded. */
export const VOICE_BILLABLE_UNITS = [
  'twilio:inbound_provider_seconds',
  'twilio:outbound_provider_seconds',
  'twilio:conference_participant_seconds',
  'twilio:outbound_sms_segments',
  'twilio:phone_number_months',
  'openai:transcription_audio_seconds',
  'openai:realtime_tokens',
  'livekit:video_participant_seconds',
  'storage:recording_storage_byte_days',
  'storage:recording_storage_egress_bytes',
] as const;

export const VOICE_BILLING_BATCH_SIZE = 1000;

export interface VoiceSellingRate {
  provider: string;
  unit: string;
  price: string;
  perQuantity: string;
}

export interface VoiceRateCardSource {
  sourceVersion: string;
  sourceReference: string;
  currency: string;
  currencyMinorUnits: number;
  effectiveFrom: string;
  rates: VoiceSellingRate[];
}

export interface VoiceBillingItem {
  usageRecordId: string;
  provider: string;
  unit: string;
  quantity: string;
  price: string;
  perQuantity: string;
  amount: string;
  usageState: string;
  providerCost: string | null;
  providerCurrency: string | null;
  measuredAt: string;
  evidenceHash: string;
}
