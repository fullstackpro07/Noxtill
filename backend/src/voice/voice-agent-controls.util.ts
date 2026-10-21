import { createHash } from 'crypto';

export interface VoiceAgentHours {
  day: number;
  opens: string;
  closes: string;
}

/** Immutable settings copied into an agent version. Empty hours means all day. */
export interface VoiceAgentControls {
  runtimeMode?: 'recorded_turns' | 'realtime';
  realtimeVoice?: string;
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
  timeZone?: string;
  weeklyHours?: VoiceAgentHours[];
  holidays?: string[];
  rolloutPercent?: number;
  maxConcurrentCalls?: number;
  maxCallSeconds?: number;
  maxToolCalls?: number;
}

export function voiceAgentAdmissionReason(
  config: VoiceAgentControls,
  callKey: string,
  direction: 'inbound' | 'outbound',
  now = new Date(),
): string | null {
  if (direction === 'inbound' && config.inboundEnabled === false)
    return 'agent_inbound_disabled';
  if (direction === 'outbound' && config.outboundEnabled === false)
    return 'agent_outbound_disabled';
  const zone = config.timeZone ?? 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return 'agent_timezone_invalid';
  }
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === key)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (config.holidays?.includes(date)) return 'agent_holiday';
  if (config.weeklyHours?.length) {
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      part('weekday'),
    );
    const time = `${part('hour')}:${part('minute')}`;
    if (
      !config.weeklyHours.some(
        (h) => h.day === day && h.opens <= time && time < h.closes,
      )
    )
      return 'agent_outside_hours';
  }
  // Stable across webhook retries. A pilot never silently routes excluded calls to legacy AI.
  if (direction === 'inbound' && (config.rolloutPercent ?? 100) < 100) {
    const bucket =
      createHash('sha256').update(callKey).digest().readUInt32BE(0) % 100;
    if (bucket >= (config.rolloutPercent ?? 100))
      return 'agent_outside_rollout';
  }
  return null;
}
