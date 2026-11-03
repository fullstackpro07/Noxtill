import { randomUUID, createHmac } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { once } from 'events';
import { ConfigService } from '@nestjs/config';
import WebSocket, { WebSocketServer } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceRealtimeGateway } from './voice-realtime.gateway';
import { VoiceRealtimeService } from './voice-realtime.service';
import {
  VOICE_MEDIA_PATH,
  decodeVoiceSocketMessage,
} from './voice-realtime.protocol';

class LocalProviderGateway extends VoiceRealtimeGateway {
  providerUrl = '';
  protected openProviderSocket() {
    return new WebSocket(this.providerUrl);
  }
}

describe('Voice websocket bridge (real MySQL and local sockets, simulated AI provider)', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({
    BACKEND_URL: 'https://voice.test/api/v1',
    TWILIO_ACCOUNT_SID: 'AC-qa',
    TWILIO_AUTH_TOKEN: 'auth-qa',
    OPENAI_API_KEY: 'not-real',
  });
  const runtime = new VoiceRealtimeService(prisma, config, {
    checkGuardrails: jest.fn().mockResolvedValue(undefined),
  } as never);
  let http: Server;
  let upstream: Server;
  let providerServer: WebSocketServer;
  let gateway: LocalProviderGateway;
  let address: string;
  let businessId: string;
  let versionId: string;
  let provider: WebSocket;
  const providerEvents: Record<string, unknown>[] = [];

  beforeAll(async () => {
    jest.spyOn(runtime, 'beginRecording').mockResolvedValue(undefined);
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'Socket QA', slug: `socket-${randomUUID()}` },
      })
    ).id;
    const agent = await prisma.voiceAiAgent.create({
      data: { businessId, name: 'Socket agent', template: 'receptionist' },
    });
    versionId = (
      await prisma.voiceAiAgentVersion.create({
        data: {
          businessId,
          agentId: agent.id,
          version: 1,
          checksum: 'qa',
          config: { runtimeMode: 'realtime', toolPermissions: [] },
        },
      })
    ).id;
    http = createServer();
    upstream = createServer();
    providerServer = new WebSocketServer({ server: upstream });
    providerServer.on('connection', (ws) => {
      provider = ws;
      ws.on('message', (data) => {
        const event = JSON.parse(decodeVoiceSocketMessage(data)) as Record<
          string,
          unknown
        >;
        providerEvents.push(event);
        if (event.type === 'session.update')
          ws.send(JSON.stringify({ type: 'session.updated' }));
      });
      ws.send(JSON.stringify({ type: 'session.created' }));
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    gateway = new LocalProviderGateway(
      { httpAdapter: { getHttpServer: () => http } } as never,
      config,
      runtime,
      { execute: jest.fn() } as never,
      { realtimeTransition: jest.fn() } as never,
    );
    gateway.providerUrl = `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    gateway.onApplicationBootstrap();
    address = `ws://127.0.0.1:${(http.address() as AddressInfo).port}${VOICE_MEDIA_PATH}`;
  });

  afterAll(async () => {
    gateway.onModuleDestroy();
    for (const ws of providerServer.clients) ws.terminate();
    providerServer.close();
    await Promise.all([
      new Promise<void>((resolve) => http.close(() => resolve())),
      new Promise<void>((resolve) => upstream.close(() => resolve())),
    ]);
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgentVersion.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgent.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function waitFor(predicate: () => boolean) {
    const until = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > until)
        throw new Error('Expected socket event was not observed');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('rejects unsigned upgrades before any AI connection', async () => {
    const ws = new WebSocket(address);
    const error = await new Promise<Error>((resolve) =>
      ws.once('error', resolve),
    );
    expect(error.message).toContain('403');
    expect(providerServer.clients.size).toBe(0);
  });

  it('streams mulaw audio, clears/truncates playback on interruption, and saves final usage once', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        voiceAgentVersionId: versionId,
        callSid: `CA-${randomUUID()}`,
        fromNumber: '+15555550111',
        recordingConsentStatus: 'granted',
      },
    });
    const xml = await runtime.maybeConnect(
      '<Response><Record /></Response>',
      call.callSid,
    );
    const sessionId = xml.match(/name="sessionId" value="([^"]+)"/)![1];
    const token = xml.match(/name="token" value="([^"]+)"/)![1];
    const signature = createHmac('sha1', 'auth-qa')
      .update(`wss://voice.test${VOICE_MEDIA_PATH}`)
      .digest('base64');
    const peer = new WebSocket(address, {
      headers: { 'x-twilio-signature': signature },
    });
    const received: Record<string, unknown>[] = [];
    peer.on('message', (data) =>
      received.push(
        JSON.parse(decodeVoiceSocketMessage(data)) as Record<string, unknown>,
      ),
    );
    await once(peer, 'open');
    peer.send(
      JSON.stringify({
        event: 'start',
        start: {
          accountSid: 'AC-qa',
          callSid: call.callSid,
          streamSid: 'MZ-qa',
          customParameters: { sessionId, token },
          mediaFormat: {
            encoding: 'audio/x-mulaw',
            sampleRate: 8000,
            channels: 1,
          },
        },
      }),
    );
    await waitFor(() =>
      providerEvents.some((e) => e.type === 'session.update'),
    );
    const audio = Buffer.alloc(800).toString('base64');
    peer.send(
      JSON.stringify({
        event: 'media',
        media: { timestamp: '1000', payload: audio },
      }),
    );
    await waitFor(() =>
      providerEvents.some((e) => e.type === 'input_audio_buffer.append'),
    );
    provider.send(JSON.stringify({ type: 'input_audio_buffer.committed' }));
    await waitFor(() =>
      providerEvents.some((e) => e.type === 'response.create'),
    );
    provider.send(
      JSON.stringify({
        type: 'response.output_audio.delta',
        item_id: 'answer-1',
        delta: audio,
      }),
    );
    await waitFor(() => received.some((e) => e.event === 'media'));
    peer.send(
      JSON.stringify({
        event: 'media',
        media: { timestamp: '1050', payload: audio },
      }),
    );
    await waitFor(
      () =>
        providerEvents.filter((e) => e.type === 'input_audio_buffer.append')
          .length === 2,
    );
    provider.send(
      JSON.stringify({ type: 'input_audio_buffer.speech_started' }),
    );
    await waitFor(() => received.some((e) => e.event === 'clear'));
    expect(
      providerEvents.find((e) => e.type === 'conversation.item.truncate'),
    ).toMatchObject({ item_id: 'answer-1', audio_end_ms: 50 });
    const response = {
      id: `resp-${randomUUID()}`,
      usage: {
        input_tokens: 20,
        output_tokens: 10,
        input_token_details: { audio_tokens: 20, text_tokens: 0 },
        output_token_details: { audio_tokens: 10, text_tokens: 0 },
      },
    };
    provider.send(JSON.stringify({ type: 'response.done', response }));
    await waitFor(() => received.length > 0);
    const until = Date.now() + 4000;
    while (
      !(await prisma.voiceUsageRecord.count({ where: { callId: call.id } }))
    ) {
      if (Date.now() > until) throw new Error('Usage was not persisted');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    peer.send(JSON.stringify({ event: 'stop' }));
    await once(peer, 'close');
    const session = await prisma.voiceRealtimeSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe('completed');
    expect(session.metrics).toMatchObject({ interruptions: 1 });
  });
});
