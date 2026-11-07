import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import {
  decodeVoiceSocketMessage,
  realtimeCostEstimate,
} from './voice-realtime.protocol';
import { voiceSpendState } from './voice-usage-metering.service';
import { VOICE_REALTIME_VOICES } from './dto/voice-ai-agent.dto';
import { voicePromptData } from './voice-prompt-policy.util';

/** Text-only test of the configured realtime model, not proof of a live telephone path. */
@Injectable()
export class VoiceRealtimeSandboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiInfraService,
  ) {}

  protected socket(key: string) {
    return new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-realtime',
      {
        headers: { Authorization: `Bearer ${key}` },
        handshakeTimeout: 8000,
        maxPayload: 1024 * 1024,
      },
    );
  }

  async test(
    businessId: string,
    versionId: string,
    instructions: string,
    scenario: string,
    maxTokens: number,
    monthlyBudgetUsd?: number | null,
  ) {
    await this.ai.checkGuardrails(businessId, 'voice_entry');
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key)
      throw this.failure(
        'VOICE_REALTIME_NOT_CONFIGURED',
        'OpenAI Realtime is not configured on the server.',
      );
    const spend = await voiceSpendState(this.prisma, businessId);
    const usage = await this.prisma.aiCallLog.aggregate({
      where: {
        businessId,
        voiceAgentVersionId: versionId,
        createdAt: { gte: spend.periodStart },
      },
      _sum: { estimatedCostUsd: true },
    });
    if (
      spend.reached ||
      (monthlyBudgetUsd != null &&
        Number(usage._sum.estimatedCostUsd ?? 0) >= monthlyBudgetUsd)
    )
      throw this.failure(
        'VOICE_AI_VERSION_BUDGET_REACHED',
        'The configured voice spending budget has been reached.',
      );
    const ws = this.socket(key);
    return new Promise<{
      content: { type: 'text'; text: string }[];
      inputTokens: number;
      outputTokens: number;
    }>((resolve, reject) => {
      let settled = false;
      let text = '';
      const finish = (error?: AppException) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (error) reject(error);
        return true;
      };
      const timer = setTimeout(
        () =>
          finish(
            this.failure(
              'VOICE_REALTIME_TEST_TIMEOUT',
              'The realtime provider did not finish the sandbox test in time.',
            ),
          ),
        15000,
      );
      ws.on('open', () =>
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              output_modalities: ['text'],
              instructions: `${instructions}\nThis is a text-only sandbox. Do not claim that any tool ran or that a booking, call or message was completed.`,
              max_output_tokens: maxTokens,
              tools: [],
              tool_choice: 'none',
            },
          }),
        ),
      );
      ws.on('message', (raw) => {
        void (async () => {
          if (settled) return;
          const event = JSON.parse(decodeVoiceSocketMessage(raw)) as {
            type: string;
            delta?: string;
            error?: { code?: string };
            response?: {
              id: string;
              status?: string;
              usage?: Parameters<typeof realtimeCostEstimate>[1];
            };
          };
          if (event.type === 'session.updated') {
            ws.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: voicePromptData('Sandbox caller scenario', {
                        liveCall: false,
                        text: scenario,
                      }),
                    },
                  ],
                },
              }),
            );
            ws.send(JSON.stringify({ type: 'response.create' }));
          } else if (event.type === 'response.output_text.delta')
            text += event.delta ?? '';
          else if (event.type === 'error') {
            const quota = [
              'insufficient_quota',
              'billing_hard_limit_reached',
            ].includes(event.error?.code ?? '');
            finish(
              this.failure(
                quota
                  ? 'AI_CREDIT_BALANCE_TOO_LOW'
                  : 'VOICE_REALTIME_TEST_FAILED',
                quota
                  ? 'OpenAI credit balance is too low for the realtime sandbox test.'
                  : 'The realtime provider rejected the sandbox test. Check provider access and model configuration.',
              ),
            );
          } else if (event.type === 'response.done' && event.response) {
            const result = event.response;
            const measured = result.usage;
            if (!measured || result.status !== 'completed' || !text.trim()) {
              finish(
                this.failure(
                  'VOICE_REALTIME_TEST_FAILED',
                  'The realtime provider did not return a completed text answer.',
                ),
              );
              return;
            }
            const inputTokens = measured.input_tokens ?? 0;
            const outputTokens = measured.output_tokens ?? 0;
            // This session is text-only, so missing audio detail is known to mean zero audio.
            const cost = realtimeCostEstimate('gpt-realtime', {
              ...measured,
              input_token_details: {
                audio_tokens: 0,
                text_tokens: inputTokens,
              },
              output_token_details: {
                audio_tokens: 0,
                text_tokens: outputTokens,
              },
            })!;
            await this.prisma.$transaction(async (tx) => {
              const existing = await tx.voiceUsageRecord.findUnique({
                where: {
                  businessId_eventKey: {
                    businessId,
                    eventKey: `openai:sandbox:${result.id}`,
                  },
                },
              });
              if (existing) return;
              await tx.voiceUsageRecord.create({
                data: {
                  businessId,
                  eventKey: `openai:sandbox:${result.id}`,
                  provider: 'openai',
                  unit: 'sandbox_text_tokens',
                  quantity: inputTokens + outputTokens,
                  cost,
                  currency: 'USD',
                  state: 'estimated',
                  evidence: {
                    model: 'gpt-realtime',
                    voiceAgentVersionId: versionId,
                    usage: measured,
                    costBasis: 'uncached_text_list_price_estimate',
                    liveCallVerified: false,
                  },
                },
              });
              await tx.aiCallLog.create({
                data: {
                  businessId,
                  kind: 'voice_realtime',
                  voiceAgentVersionId: versionId,
                  inputTokens,
                  outputTokens,
                  estimatedCostUsd: cost,
                },
              });
            });
            if (finish())
              resolve({
                content: [{ type: 'text', text: text.trim().slice(0, 2000) }],
                inputTokens,
                outputTokens,
              });
          }
        })().catch(() =>
          finish(
            this.failure(
              'VOICE_REALTIME_TEST_FAILED',
              'The realtime sandbox test could not be completed.',
            ),
          ),
        );
      });
      ws.on('error', () =>
        finish(
          this.failure(
            'VOICE_REALTIME_TEST_UNAVAILABLE',
            'The realtime provider could not be reached.',
          ),
        ),
      );
      ws.on('close', () => {
        if (!settled)
          finish(
            this.failure(
              'VOICE_REALTIME_TEST_DISCONNECTED',
              'The realtime provider disconnected before finishing the test.',
            ),
          );
      });
    });
  }

  /** Generates a short, explicitly requested Realtime audio sample without placing a call. */
  async previewVoice(
    businessId: string,
    actorUserId: string,
    versionId: string,
    voice: string,
    monthlyBudgetUsd?: number | null,
  ) {
    if (!(VOICE_REALTIME_VOICES as readonly string[]).includes(voice))
      throw this.failure(
        'VOICE_REALTIME_VOICE_INVALID',
        'Choose a supported OpenAI Realtime voice.',
      );
    await this.ai.checkGuardrails(businessId, 'voice_entry');
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key)
      throw this.failure(
        'VOICE_REALTIME_NOT_CONFIGURED',
        'OpenAI Realtime is not configured on the server.',
      );
    const spend = await voiceSpendState(this.prisma, businessId);
    const usage = await this.prisma.aiCallLog.aggregate({
      where: {
        businessId,
        voiceAgentVersionId: versionId,
        createdAt: { gte: spend.periodStart },
      },
      _sum: { estimatedCostUsd: true },
    });
    if (
      spend.reached ||
      (monthlyBudgetUsd != null &&
        Number(usage._sum.estimatedCostUsd ?? 0) >= monthlyBudgetUsd)
    )
      throw this.failure(
        'VOICE_AI_VERSION_BUDGET_REACHED',
        'The configured voice spending budget has been reached.',
      );

    const ws = this.socket(key);
    return new Promise<{
      audioBase64: string;
      voice: string;
      sampleRate: 24000;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    }>((resolve, reject) => {
      let settled = false;
      let audioBytes = 0;
      const audio: string[] = [];
      const finish = (error?: AppException) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (error) reject(error);
        return true;
      };
      const timer = setTimeout(
        () =>
          finish(
            this.failure(
              'VOICE_REALTIME_PREVIEW_TIMEOUT',
              'OpenAI Realtime did not finish the voice preview in time.',
            ),
          ),
        15000,
      );
      ws.on('open', () =>
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              output_modalities: ['audio'],
              voice,
              instructions:
                'Speak the supplied short sample sentence naturally and clearly. Do not add words.',
              max_output_tokens: 96,
              tools: [],
              tool_choice: 'none',
            },
          }),
        ),
      );
      ws.on('message', (raw) => {
        void (async () => {
          if (settled) return;
          const event = JSON.parse(decodeVoiceSocketMessage(raw)) as {
            type: string;
            delta?: string;
            error?: { code?: string };
            response?: {
              id: string;
              status?: string;
              usage?: Parameters<typeof realtimeCostEstimate>[1];
            };
          };
          if (event.type === 'session.updated') {
            ws.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: 'Say exactly: Hello, this is a short sample of the selected Noxtill assistant voice. How may I help you today?',
                    },
                  ],
                },
              }),
            );
            ws.send(JSON.stringify({ type: 'response.create' }));
          } else if (event.type === 'response.output_audio.delta') {
            const delta = event.delta ?? '';
            const byteLength = Buffer.from(delta, 'base64').length;
            audioBytes += byteLength;
            if (audioBytes > 768 * 1024) {
              finish(
                this.failure(
                  'VOICE_REALTIME_PREVIEW_TOO_LARGE',
                  'The generated voice preview exceeded its size limit.',
                ),
              );
              return;
            }
            audio.push(delta);
          } else if (event.type === 'error') {
            const quota = [
              'insufficient_quota',
              'billing_hard_limit_reached',
            ].includes(event.error?.code ?? '');
            finish(
              this.failure(
                quota
                  ? 'AI_CREDIT_BALANCE_TOO_LOW'
                  : 'VOICE_REALTIME_PREVIEW_FAILED',
                quota
                  ? 'OpenAI credit balance is too low for the voice preview.'
                  : 'OpenAI Realtime could not generate this voice preview.',
              ),
            );
          } else if (event.type === 'response.done' && event.response) {
            const result = event.response;
            const measured = result.usage;
            const inputTokens = measured?.input_tokens;
            const outputTokens = measured?.output_tokens;
            const cost = measured
              ? realtimeCostEstimate('gpt-realtime', measured)
              : null;
            if (
              result.status !== 'completed' ||
              !audioBytes ||
              !Number.isFinite(inputTokens) ||
              !Number.isFinite(outputTokens) ||
              cost === null
            ) {
              finish(
                this.failure(
                  'VOICE_REALTIME_PREVIEW_UNVERIFIED',
                  'OpenAI did not return completed audio and priced token usage; the preview was not returned.',
                ),
              );
              return;
            }
            await this.prisma.$transaction(async (tx) => {
              const eventKey = `openai:voice-preview:${result.id}`;
              const existing = await tx.voiceUsageRecord.findUnique({
                where: { businessId_eventKey: { businessId, eventKey } },
              });
              if (existing) return;
              await tx.voiceUsageRecord.create({
                data: {
                  businessId,
                  eventKey,
                  provider: 'openai',
                  unit: 'realtime_voice_preview_tokens',
                  quantity: Number(inputTokens) + Number(outputTokens),
                  cost,
                  currency: 'USD',
                  state: 'estimated',
                  evidence: {
                    model: 'gpt-realtime',
                    voiceAgentVersionId: versionId,
                    voice,
                    usage: measured,
                    costBasis: 'uncached_realtime_list_price_estimate',
                    liveCallVerified: false,
                    audioStored: false,
                  },
                },
              });
              await tx.aiCallLog.create({
                data: {
                  businessId,
                  kind: 'voice_realtime_voice_preview',
                  voiceAgentVersionId: versionId,
                  inputTokens: Number(inputTokens),
                  outputTokens: Number(outputTokens),
                  estimatedCostUsd: cost,
                },
              });
              await tx.auditLog.create({
                data: {
                  businessId,
                  actorUserId,
                  action: 'voice.ai_agent_voice_previewed',
                  entity: 'VoiceAiAgentVersion',
                  entityId: versionId,
                  after: {
                    model: 'gpt-realtime',
                    voice,
                    inputTokens: Number(inputTokens),
                    outputTokens: Number(outputTokens),
                    estimatedCostUsd: cost,
                  },
                },
              });
            });
            if (finish())
              resolve({
                audioBase64: audio.join(''),
                voice,
                sampleRate: 24000,
                inputTokens: Number(inputTokens),
                outputTokens: Number(outputTokens),
                estimatedCostUsd: cost,
              });
          }
        })().catch(() =>
          finish(
            this.failure(
              'VOICE_REALTIME_PREVIEW_FAILED',
              'The voice preview failed before usage could be verified.',
            ),
          ),
        );
      });
      ws.on('error', () =>
        finish(
          this.failure(
            'VOICE_REALTIME_PREVIEW_UNAVAILABLE',
            'OpenAI Realtime could not be reached for the voice preview.',
          ),
        ),
      );
      ws.on('close', () => {
        if (!settled)
          finish(
            this.failure(
              'VOICE_REALTIME_PREVIEW_DISCONNECTED',
              'OpenAI Realtime disconnected before completing the voice preview.',
            ),
          );
      });
    });
  }

  private failure(code: string, message: string) {
    return new AppException(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
