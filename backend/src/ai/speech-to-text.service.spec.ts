import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SpeechToTextService } from './speech-to-text.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SpeechToTextService', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns transcript and provider-reported duration using verbose JSON', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        text: 'A short QA transcript.',
        duration: 12.42,
        usage: { type: 'duration', seconds: 13 },
      },
    });
    const service = new SpeechToTextService(
      new ConfigService({ OPENAI_API_KEY: 'qa-only-not-a-real-secret' }),
    );

    await expect(
      service.transcribeWithMetrics(
        Buffer.from('audio'),
        'audio/mpeg',
        'qa.mp3',
      ),
    ).resolves.toEqual({ text: 'A short QA transcript.', audioSeconds: 13 });

    const form = mockedAxios.post.mock.calls[0][1] as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
  });

  it('uses provider media duration when usage seconds are omitted and keeps absent duration unknown', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { text: 'Transcript.', duration: 4.5 } })
      .mockResolvedValueOnce({ data: { text: 'Transcript.' } });
    const service = new SpeechToTextService(
      new ConfigService({ OPENAI_API_KEY: 'qa-only-not-a-real-secret' }),
    );

    await expect(
      service.transcribeWithMetrics(
        Buffer.from('audio'),
        'audio/mpeg',
        'qa.mp3',
      ),
    ).resolves.toEqual({ text: 'Transcript.', audioSeconds: 4.5 });
    await expect(
      service.transcribeWithMetrics(
        Buffer.from('audio'),
        'audio/mpeg',
        'qa.mp3',
      ),
    ).resolves.toEqual({ text: 'Transcript.', audioSeconds: null });
  });
});
