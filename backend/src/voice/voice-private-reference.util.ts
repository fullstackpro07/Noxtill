/** Booking-management credentials may be used by the server, never retained in text/LLM history. */
export function voicePrivateReferences(text: string): string[] {
  return [...new Set(text.match(/\b[a-f0-9]{32,64}\b/gi) ?? [])]
    .slice(0, 3)
    .map((value) => value.toLowerCase());
}

export function maskVoicePrivateReferences(text: string): string {
  return text.replace(/\b[a-f0-9]{32,64}\b/gi, '[private reference]');
}
