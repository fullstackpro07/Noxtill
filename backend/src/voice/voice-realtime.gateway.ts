import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Server, IncomingMessage } from 'http';
import { Duplex } from 'stream';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import { verifyTwilioSignature } from '../common/webhooks/signature.util';
import { VoiceRealtimeService } from './voice-realtime.service';
import {
  VoiceRealtimeToolsService,
  realtimeToolDefinitions,
} from './voice-realtime-tools.service';
import { VoiceCallService } from './voice-call.service';
import {
  VoicePlaybackTracker,
  VOICE_MEDIA_PATH,
  realtimeSessionUpdate,
  decodeVoiceSocketMessage,
} from './voice-realtime.protocol';

/** Server-only audio bridge. The Twilio signature and one-use call-bound token are both required. */
@Injectable()
export class VoiceRealtimeGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(VoiceRealtimeGateway.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });
  private server?: Server;
  private readonly upgrade = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    if (req.url?.replace(/\/$/, '') !== VOICE_MEDIA_PATH) return;
    const publicUrl = this.realtime.mediaUrl();
    const auth = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const signature = req.headers['x-twilio-signature'];
    const signedUrl =
      publicUrl && (req.url.endsWith('/') ? `${publicUrl}/` : publicUrl);
    if (
      !auth ||
      !signedUrl ||
      typeof signature !== 'string' ||
      !verifyTwilioSignature(signedUrl, {}, signature, auth) ||
      this.wss.clients.size >= 100
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws));
  };

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly config: ConfigService,
    private readonly realtime: VoiceRealtimeService,
    private readonly tools: VoiceRealtimeToolsService,
    private readonly calls: VoiceCallService,
  ) {}

  onApplicationBootstrap() {
    this.server = this.adapter.httpAdapter.getHttpServer() as Server;
    this.server.on('upgrade', this.upgrade);
  }

  onModuleDestroy() {
    this.server?.off('upgrade', this.upgrade);
    for (const ws of this.wss.clients) ws.close(1001, 'Server shutting down');
    this.wss.close();
  }

  protected openProviderSocket(model: string, apiKey: string): WebSocket {
    return new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        maxPayload: 1024 * 1024,
        handshakeTimeout: 8000,
      },
    );
  }

  private connect(peer: WebSocket) {
    let runtime: Awaited<
      ReturnType<VoiceRealtimeService['acceptStart']>
    > | null = null;
    let provider: WebSocket | null = null;
    let ready = false;
    let initializing = false;
    let closed = false;
    let transitioning = false;
    let incomingTimestamp = 0;
    let lastCommittedAt = 0;
    let waitingForFirstAudio = false;
    let pending: {
      id: string;
      tool: string;
      args: Record<string, unknown>;
      expiresAt: number;
    } | null = null;
    let transition: 'transfer' | 'end' | null = null;
    let errorCode: string | undefined;
    const processedTools = new Set<string>();
    const playbackMarks = new Map<
      string,
      { itemId: string; action: 'transfer' | 'end' | null }
    >();
    const buffered: string[] = [];
    let bufferedBytes = 0;
    const playback = new VoicePlaybackTracker();
    const metrics: Record<string, number> = {
      interruptions: 0,
      responses: 0,
      latencySamples: 0,
      totalFirstAudioLatencyMs: 0,
    };
    const firstAudioLatencySamplesMs: number[] = [];
    let maxDuration: NodeJS.Timeout | undefined;
    let idleTimer: NodeJS.Timeout | undefined;
    let transitionTimer: NodeJS.Timeout | undefined;
    let alive = true;
    const handshakeTimer = setTimeout(() => {
      void fail('VOICE_STREAM_START_TIMEOUT');
    }, 5000);
    handshakeTimer.unref();
    const heartbeat = setInterval(() => {
      if (!alive) {
        void fail('VOICE_STREAM_CONNECTION_LOST');
        return;
      }
      alive = false;
      if (peer.readyState === WebSocket.OPEN) peer.ping();
    }, 30_000);
    heartbeat.unref();
    peer.on('pong', () => {
      alive = true;
    });
    const sendPeer = (data: unknown) => {
      if (peer.readyState === WebSocket.OPEN) {
        if (peer.bufferedAmount > 1024 * 1024) {
          void fail('VOICE_STREAM_BACKPRESSURE');
          return;
        }
        peer.send(JSON.stringify(data));
      }
    };
    const sendProvider = (data: unknown) => {
      if (provider?.readyState === WebSocket.OPEN) {
        if (provider.bufferedAmount > 1024 * 1024) {
          void fail('VOICE_STREAM_BACKPRESSURE');
          return;
        }
        provider.send(JSON.stringify(data));
      }
    };
    const close = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(handshakeTimer);
      clearInterval(heartbeat);
      clearTimeout(maxDuration);
      clearTimeout(idleTimer);
      clearTimeout(transitionTimer);
      pending = null;
      if (provider && provider.readyState < WebSocket.CLOSING) provider.close();
      try {
        if (runtime)
          await this.realtime.finish(
            runtime.session.id,
            { ...metrics, firstAudioLatencySamplesMs },
            errorCode,
          );
      } finally {
        if (peer.readyState < WebSocket.CLOSING) peer.close();
      }
    };
    const fail = async (code: string) => {
      if (closed) return;
      errorCode = code;
      // No raw provider response, authorization header, token or audio enters logs.
      this.logger.warn(`Realtime voice ended: ${code}`);
      await close();
    };
    const applyTransition = async (action: 'transfer' | 'end') => {
      if (!runtime || closed || transitioning) return;
      transitioning = true;
      try {
        const xml = await this.calls.realtimeTransition(
          runtime.session.call.callSid,
          action,
        );
        await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${this.config.get<string>('TWILIO_ACCOUNT_SID')}/Calls/${runtime.session.call.callSid}.json`,
          new URLSearchParams({ Twiml: xml }).toString(),
          {
            auth: {
              username: this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '',
              password: this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 8000,
          },
        );
        await close();
      } catch {
        await fail('VOICE_STREAM_TRANSITION_FAILED');
      }
    };
    const respond = async () => {
      if (!runtime || closed || !ready) return;
      await this.realtime.checkKnowledge(
        runtime.session.businessId,
        runtime.knowledgeSourceIds,
      );
      await this.realtime.checkBudget(
        runtime.session.businessId,
        runtime.session.call.voiceAgentVersionId!,
        runtime.controls,
      );
      sendProvider({ type: 'response.create' });
    };
    const finishTool = async (
      id: string,
      name: string,
      args: Record<string, unknown>,
      confirmed = false,
    ) => {
      if (!runtime || closed) return;
      let result: unknown;
      await this.realtime.checkKnowledge(
        runtime.session.businessId,
        runtime.knowledgeSourceIds,
      );
      try {
        result = await this.tools.execute(
          runtime.session.id,
          id,
          name,
          args,
          confirmed,
        );
        if (
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'confirmation_required'
        ) {
          pending = { id, tool: name, args, expiresAt: Date.now() + 30_000 };
        }
        const action = (
          result as { result?: { transition?: 'transfer' | 'end' } }
        ).result?.transition;
        if (action) {
          transition = action;
          clearTimeout(transitionTimer);
          transitionTimer = setTimeout(() => {
            void applyTransition(action);
          }, 15_000);
          transitionTimer.unref();
        }
      } catch {
        result = {
          status: 'denied',
          message:
            'This action is not permitted or its arguments are invalid. Offer staff follow-up.',
        };
      }
      if (confirmed) {
        // The original tool call has already received its pending result.
        sendProvider({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Server-confirmed keypad decision: ${JSON.stringify(result)}`,
              },
            ],
          },
        });
      } else {
        sendProvider({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: id,
            output: JSON.stringify(result),
          },
        });
      }
      await respond();
    };
    const onProviderEvent = async (raw: WebSocket.RawData) => {
      if (!runtime || closed) return;
      const event = JSON.parse(decodeVoiceSocketMessage(raw)) as Record<
        string,
        unknown
      >;
      switch (event.type) {
        case 'session.created':
          sendProvider(
            realtimeSessionUpdate(
              runtime.instructions,
              runtime.controls.maxTokensPerResponse ?? 320,
              realtimeToolDefinitions(runtime.controls),
              runtime.controls.realtimeVoice ?? 'marin',
            ),
          );
          break;
        case 'session.updated':
          ready = true;
          clearTimeout(idleTimer);
          for (const audio of buffered)
            sendProvider({ type: 'input_audio_buffer.append', audio });
          buffered.length = 0;
          bufferedBytes = 0;
          break;
        case 'response.created':
          if (typeof (event.response as { id?: unknown })?.id === 'string')
            await this.realtime.startResponse(
              runtime.session.id,
              (event.response as { id: string }).id,
            );
          break;
        case 'input_audio_buffer.committed':
          lastCommittedAt = Date.now();
          waitingForFirstAudio = true;
          await respond();
          break;
        case 'input_audio_buffer.speech_started': {
          const truncate = playback.interrupt(incomingTimestamp);
          if (truncate) {
            metrics.interruptions++;
            sendPeer({ event: 'clear', streamSid: runtime.session.streamSid });
            sendProvider(truncate);
          }
          transition = null;
          playbackMarks.clear();
          clearTimeout(transitionTimer);
          break;
        }
        case 'response.output_audio.delta':
          if (
            typeof event.delta !== 'string' ||
            typeof event.item_id !== 'string'
          )
            break;
          if (waitingForFirstAudio) {
            metrics.latencySamples++;
            metrics.totalFirstAudioLatencyMs += Date.now() - lastCommittedAt;
            if (firstAudioLatencySamplesMs.length < 200)
              firstAudioLatencySamplesMs.push(Date.now() - lastCommittedAt);
            waitingForFirstAudio = false;
          }
          playback.audio(event.item_id, event.delta, incomingTimestamp);
          sendPeer({
            event: 'media',
            streamSid: runtime.session.streamSid,
            media: { payload: event.delta },
          });
          break;
        case 'response.output_audio.done':
          if (typeof event.item_id !== 'string') break;
          playbackMarks.set(`audio:${event.item_id}`, {
            itemId: event.item_id,
            action: transition,
          });
          sendPeer({
            event: 'mark',
            streamSid: runtime.session.streamSid,
            mark: { name: `audio:${event.item_id}` },
          });
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (typeof event.transcript === 'string')
            await this.realtime.appendTranscript(
              runtime.session.callId,
              'caller',
              event.transcript,
            );
          break;
        case 'response.output_audio_transcript.done':
          if (typeof event.transcript === 'string')
            await this.realtime.appendTranscript(
              runtime.session.callId,
              'assistant',
              event.transcript,
            );
          break;
        case 'response.function_call_arguments.done': {
          if (
            typeof event.call_id !== 'string' ||
            typeof event.name !== 'string' ||
            typeof event.arguments !== 'string' ||
            event.arguments.length > 4096 ||
            processedTools.has(event.call_id)
          )
            break;
          processedTools.add(event.call_id);
          if (processedTools.size > 50) {
            await fail('VOICE_AI_TOOL_LIMIT_REACHED');
            return;
          }
          const args: unknown = JSON.parse(event.arguments);
          if (!args || typeof args !== 'object' || Array.isArray(args))
            throw new Error('Invalid function arguments');
          await finishTool(
            event.call_id,
            event.name,
            args as Record<string, unknown>,
          );
          break;
        }
        case 'response.done':
          metrics.responses++;
          await this.realtime.recordResponse(
            runtime.session.id,
            event.response as { id: string; usage?: Record<string, unknown> },
          );
          break;
        case 'error':
          await fail('VOICE_REALTIME_PROVIDER_ERROR');
          break;
      }
    };
    peer.on('message', (raw) => {
      void (async () => {
        const event = JSON.parse(decodeVoiceSocketMessage(raw)) as {
          event?: string;
          start?: Parameters<VoiceRealtimeService['acceptStart']>[0];
          media?: { timestamp?: string; payload?: string };
          dtmf?: { digit?: string };
          mark?: { name?: string };
        };
        if (event.event === 'start') {
          if (initializing || runtime || !event.start)
            throw new Error('Duplicate start');
          initializing = true;
          runtime = await this.realtime.acceptStart(event.start);
          if (closed) {
            await this.realtime.finish(
              runtime.session.id,
              metrics,
              'VOICE_STREAM_CONNECTION_LOST',
            );
            return;
          }
          clearTimeout(handshakeTimer);
          const apiKey = this.config.get<string>('OPENAI_API_KEY');
          if (!apiKey || runtime.session.model !== 'gpt-realtime') {
            await fail('VOICE_REALTIME_NOT_CONFIGURED');
            return;
          }
          await this.realtime.beginRecording(runtime.session.id);
          const remaining = Math.max(
            1,
            (runtime.controls.maxCallSeconds ?? 600) * 1000 -
              (Date.now() - runtime.session.call.startedAt.getTime()),
          );
          maxDuration = setTimeout(() => {
            void fail('VOICE_AGENT_CALL_DURATION_REACHED');
          }, remaining);
          maxDuration.unref();
          provider = this.openProviderSocket(runtime.session.model, apiKey);
          idleTimer = setTimeout(() => {
            void fail('VOICE_REALTIME_CONNECT_TIMEOUT');
          }, 10_000);
          idleTimer.unref();
          provider.on('message', (data) => {
            void onProviderEvent(data).catch(() =>
              fail('VOICE_REALTIME_EVENT_FAILED'),
            );
          });
          provider.on('error', () => {
            void fail('VOICE_REALTIME_PROVIDER_ERROR');
          });
          provider.on('close', () => {
            if (!closed) void fail('VOICE_REALTIME_DISCONNECTED');
          });
        } else if (event.event === 'media') {
          if (
            !runtime ||
            !event.media ||
            typeof event.media.payload !== 'string'
          )
            return;
          if (
            event.media.payload.length > 16_384 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(event.media.payload)
          )
            throw new Error('Invalid audio');
          const timestamp = Number(event.media.timestamp);
          if (Number.isFinite(timestamp))
            incomingTimestamp = Math.max(incomingTimestamp, timestamp);
          if (ready)
            sendProvider({
              type: 'input_audio_buffer.append',
              audio: event.media.payload,
            });
          else {
            bufferedBytes += event.media.payload.length;
            if (bufferedBytes > 64_000) {
              await fail('VOICE_REALTIME_CONNECT_TIMEOUT');
              return;
            }
            buffered.push(event.media.payload);
          }
        } else if (event.event === 'dtmf' && pending) {
          const decision = pending;
          pending = null;
          if (event.dtmf?.digit === '1' && decision.expiresAt >= Date.now())
            await finishTool(decision.id, decision.tool, decision.args, true);
          else {
            sendProvider({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: 'Server keypad decision: the pending action was cancelled or expired; no business change was made.',
                  },
                ],
              },
            });
            await respond();
          }
        } else if (event.event === 'mark' && event.mark?.name) {
          const mark = playbackMarks.get(event.mark.name);
          if (mark) {
            playback.complete(mark.itemId);
            playbackMarks.delete(event.mark.name);
            if (mark.action && mark.action === transition) {
              transition = null;
              await applyTransition(mark.action);
            }
          }
        } else if (event.event === 'stop') {
          await close();
        }
      })().catch(() => fail('VOICE_STREAM_INVALID_EVENT'));
    });
    peer.on('error', () => {
      void fail('VOICE_STREAM_CONNECTION_LOST');
    });
    peer.on('close', () => {
      if (!closed) void fail('VOICE_STREAM_CONNECTION_LOST');
    });
  }
}
