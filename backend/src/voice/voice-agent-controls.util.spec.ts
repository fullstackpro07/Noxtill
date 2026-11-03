import { voiceAgentAdmissionReason } from './voice-agent-controls.util';
import {
  VoicePlaybackTracker,
  realtimeCostEstimate,
  realtimeSessionUpdate,
} from './voice-realtime.protocol';

describe('Voice agent availability, pilot and realtime audio protocol', () => {
  it('respects local holidays, opening boundaries and channel restrictions', () => {
    const config = {
      timeZone: 'America/New_York',
      weeklyHours: [{ day: 1, opens: '09:00', closes: '17:00' }],
    };
    expect(
      voiceAgentAdmissionReason(
        config,
        'call',
        'inbound',
        new Date('2026-10-19T13:00:00Z'),
      ),
    ).toBeNull();
    expect(
      voiceAgentAdmissionReason(
        config,
        'call',
        'inbound',
        new Date('2026-10-19T21:00:00Z'),
      ),
    ).toBe('agent_outside_hours');
    expect(
      voiceAgentAdmissionReason(
        { ...config, holidays: ['2026-10-19'] },
        'call',
        'inbound',
        new Date('2026-10-19T13:00:00Z'),
      ),
    ).toBe('agent_holiday');
    expect(
      voiceAgentAdmissionReason({ outboundEnabled: false }, 'call', 'outbound'),
    ).toBe('agent_outbound_disabled');
    expect(
      voiceAgentAdmissionReason({ timeZone: 'invalid' }, 'call', 'inbound'),
    ).toBe('agent_timezone_invalid');
  });

  it('keeps pilot allocation stable across retries and does not apply inbound rollout to outbound campaigns', () => {
    const config = { rolloutPercent: 5 };
    const results = Array.from({ length: 1000 }, (_, i) =>
      voiceAgentAdmissionReason(config, `call-${i}`, 'inbound'),
    );
    expect(results).toEqual(
      Array.from({ length: 1000 }, (_, i) =>
        voiceAgentAdmissionReason(config, `call-${i}`, 'inbound'),
      ),
    );
    expect(results.filter((r) => r === null).length).toBeGreaterThan(0);
    expect(results.filter((r) => r === null).length).toBeLessThan(100);
    expect(voiceAgentAdmissionReason(config, 'call', 'outbound')).toBeNull();
  });

  it('truncates interrupted audio only through the amount sent and the playback clock', () => {
    const tracker = new VoicePlaybackTracker();
    tracker.audio('item-1', Buffer.alloc(8000).toString('base64'), 1000);
    expect(tracker.interrupt(1300)).toEqual({
      type: 'conversation.item.truncate',
      item_id: 'item-1',
      content_index: 0,
      audio_end_ms: 300,
    });
    expect(tracker.interrupt(1500)).toBeNull();
    tracker.audio('item-2', Buffer.alloc(800).toString('base64'), 1500);
    expect(tracker.interrupt(2500)?.audio_end_ms).toBe(100);
  });

  it('configures compatible mu-law audio and keeps response creation behind server budget checks', () => {
    const update = realtimeSessionUpdate('facts', 320, []);
    const selectedVoice = realtimeSessionUpdate('facts', 320, [], 'cedar');
    expect(update.session.audio.input.format.type).toBe('audio/pcmu');
    expect(update.session.audio.output.voice).toBe('marin');
    expect(selectedVoice.session.audio.output.voice).toBe('cedar');
    expect(update.session.audio.input.turn_detection.create_response).toBe(
      false,
    );
    expect(update.session.audio.input.turn_detection.interrupt_response).toBe(
      true,
    );
    expect(realtimeCostEstimate('unknown-model', {})).toBeNull();
    expect(realtimeCostEstimate('gpt-realtime', {})).toBeNull();
    expect(
      realtimeCostEstimate('gpt-realtime', {
        input_token_details: { audio_tokens: 1000, text_tokens: 1000 },
        output_token_details: { audio_tokens: 1000, text_tokens: 1000 },
      }),
    ).toBe(0.116);
  });
});
