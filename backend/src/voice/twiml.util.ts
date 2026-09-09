export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `voiceId` selects a real Twilio `<Say>` voice (e.g. "Polly.Joanna") — Twilio's own default when unset. */
export function say(text: string, voiceId?: string | null): string {
  const voiceAttr = voiceId ? ` voice="${escapeXml(voiceId)}"` : '';
  return `<Say${voiceAttr}>${escapeXml(text)}</Say>`;
}

export function twiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}
