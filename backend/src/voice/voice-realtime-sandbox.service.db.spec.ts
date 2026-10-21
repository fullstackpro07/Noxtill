import { randomUUID } from 'crypto';
import { once } from 'events';
import { AddressInfo } from 'net';
import WebSocket, { WebSocketServer } from 'ws';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceRealtimeSandboxService } from './voice-realtime-sandbox.service';
import { decodeVoiceSocketMessage } from './voice-realtime.protocol';

class LocalSandbox extends VoiceRealtimeSandboxService {
  port = 0;
  protected socket() {
    return new WebSocket(`ws://127.0.0.1:${this.port}`);
  }
}
describe('Realtime sandbox (MySQL, simulated provider)', () => {
  const prisma = new PrismaService();
  const guardrails = {
    checkGuardrails: jest.fn().mockResolvedValue(undefined),
  };
  const server = new WebSocketServer({ port: 0 });
  const sandbox = new LocalSandbox(
    prisma,
    new ConfigService({ OPENAI_API_KEY: 'qa-only' }),
    guardrails as never,
  );
  let businessId: string;
  let versionId: string;
  let quotaError = false;
  let audioPreview = false;
  beforeAll(async () => {
    if (!server.address()) await once(server, 'listening');
    sandbox.port = (server.address() as AddressInfo).port;
    server.on('connection', (ws) =>
      ws.on('message', (raw) => {
        const event = JSON.parse(decodeVoiceSocketMessage(raw)) as {
          type: string;
          session?: {
            tools: unknown[];
            output_modalities: string[];
            voice?: string;
          };
        };
        if (event.type === 'session.update') {
          expect(event.session?.tools).toEqual([]);
          expect(event.session?.output_modalities).toEqual([
            audioPreview ? 'audio' : 'text',
          ]);
          if (audioPreview) expect(event.session?.voice).toBe('cedar');
          ws.send(JSON.stringify({ type: 'session.updated' }));
        } else if (event.type === 'response.create') {
          if (quotaError)
            ws.send(
              JSON.stringify({
                type: 'error',
                error: { code: 'insufficient_quota' },
              }),
            );
          else if (audioPreview) {
            ws.send(
              JSON.stringify({
                type: 'response.output_audio.delta',
                delta: Buffer.from([0, 0, 1, 0, 2, 0]).toString('base64'),
              }),
            );
            ws.send(
              JSON.stringify({
                type: 'response.done',
                response: {
                  id: `qa-audio-${randomUUID()}`,
                  status: 'completed',
                  usage: {
                    input_tokens: 11,
                    output_tokens: 7,
                    input_token_details: { audio_tokens: 0, text_tokens: 11 },
                    output_token_details: { audio_tokens: 7, text_tokens: 0 },
                  },
                },
              }),
            );
          } else {
            ws.send(
              JSON.stringify({
                type: 'response.output_text.delta',
                delta: 'QA simulated response, not a real call',
              }),
            );
            ws.send(
              JSON.stringify({
                type: 'response.done',
                response: {
                  id: `qa-${randomUUID()}`,
                  status: 'completed',
                  usage: { input_tokens: 100, output_tokens: 20 },
                },
              }),
            );
          }
        }
      }),
    );
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'QA sandbox', slug: `qa-sandbox-${randomUUID()}` },
      })
    ).id;
    const agent = await prisma.voiceAiAgent.create({
      data: { businessId, name: 'QA', template: 'receptionist' },
    });
    versionId = (
      await prisma.voiceAiAgentVersion.create({
        data: {
          businessId,
          agentId: agent.id,
          version: 1,
          checksum: 'qa',
          config: { runtimeMode: 'realtime' },
        },
      })
    ).id;
  });
  afterAll(async () => {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgentVersion.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgent.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });
  it('uses the realtime model, no tools, actual returned token counts and labelled estimated costs', async () => {
    const result = await sandbox.test(
      businessId,
      versionId,
      'Only real facts',
      'A test question',
      64,
    );
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(20);
    const usage = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId },
    });
    expect(usage.state).toBe('estimated');
    expect(Number(usage.cost)).toBeCloseTo(0.00072, 6);
    expect(usage.evidence).toMatchObject({ liveCallVerified: false });
    expect(
      await prisma.aiCallLog.count({
        where: { businessId, voiceAgentVersionId: versionId },
      }),
    ).toBe(1);
  });
  it('records a provider quota error honestly rather than passing or inventing usage', async () => {
    quotaError = true;
    await expect(
      sandbox.test(businessId, versionId, 'QA', 'QA', 64),
    ).rejects.toMatchObject({
      message:
        'OpenAI credit balance is too low for the realtime sandbox test.',
    });
    expect(await prisma.voiceUsageRecord.count({ where: { businessId } })).toBe(
      1,
    );
  });

  it('generates a real-format audio preview and records its measured usage without storing audio', async () => {
    audioPreview = true;
    quotaError = false;
    const result = await sandbox.previewVoice(
      businessId,
      'qa-owner',
      versionId,
      'cedar',
    );
    expect(result).toMatchObject({
      voice: 'cedar',
      sampleRate: 24000,
      inputTokens: 11,
      outputTokens: 7,
    });
    expect(result.estimatedCostUsd).toBeCloseTo(0.000492, 6);
    expect(Buffer.from(result.audioBase64, 'base64')).toEqual(
      Buffer.from([0, 0, 1, 0, 2, 0]),
    );
    const usage = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId, unit: 'realtime_voice_preview_tokens' },
    });
    expect(usage).toMatchObject({
      provider: 'openai',
      currency: 'USD',
      state: 'estimated',
    });
    expect(usage.evidence).toMatchObject({
      model: 'gpt-realtime',
      voice: 'cedar',
      audioStored: false,
      liveCallVerified: false,
    });
    expect(
      await prisma.aiCallLog.count({
        where: { businessId, kind: 'voice_realtime_voice_preview' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          action: 'voice.ai_agent_voice_previewed',
          entityId: versionId,
        },
      }),
    ).toBe(1);
  });
});
