import { ConfigService } from '@nestjs/config';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { Readable } from 'stream';
import { PollyVoiceService } from './polly-voice.service';

describe('PollyVoiceService (Receptionist Settings depth fix — real voice preview)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null (no preview) for a Twilio legacy non-Polly voice name', async () => {
    const service = new PollyVoiceService(
      new ConfigService({
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );
    const result = await service.synthesizePreview('alice');
    expect(result).toBeNull();
  });

  it('returns null (not fabricated) when AWS credentials are not configured', async () => {
    const service = new PollyVoiceService(new ConfigService({}));
    const result = await service.synthesizePreview('Polly.Joanna');
    expect(result).toBeNull();
  });

  it('returns real synthesized audio bytes for a real Polly voice when configured', async () => {
    const sendSpy = jest
      .spyOn(PollyClient.prototype, 'send')
      .mockResolvedValue({
        AudioStream: Readable.from([Buffer.from('fake-mp3-bytes')]),
      } as never);
    const service = new PollyVoiceService(
      new ConfigService({
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );

    const result = await service.synthesizePreview('Polly.Joanna');
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('fake-mp3-bytes');

    const command = sendSpy.mock.calls[0][0] as SynthesizeSpeechCommand;
    expect(command.input.VoiceId).toBe('Joanna');
    expect(command.input.OutputFormat).toBe('mp3');
  });

  it('returns null (not fabricated) when Polly synthesis fails', async () => {
    jest
      .spyOn(PollyClient.prototype, 'send')
      .mockRejectedValue(new Error('AWS error') as never);
    const service = new PollyVoiceService(
      new ConfigService({
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );

    const result = await service.synthesizePreview('Polly.Matthew');
    expect(result).toBeNull();
  });
});
