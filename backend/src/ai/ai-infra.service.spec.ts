import axios from 'axios';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from './ai-infra.service';
import { ClaudeClient, CreateMessageResult } from './claude.client';
import { AppException } from '../common/filters/app.exception';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function fakeResult(
  overrides: Partial<CreateMessageResult> = {},
): CreateMessageResult {
  return {
    content: [{ type: 'text', text: 'hello' }],
    stopReason: 'end_turn',
    inputTokens: 1000,
    outputTokens: 500,
    ...overrides,
  };
}

function appErrorResponse(error: unknown): unknown {
  return error instanceof AppException ? error.getResponse() : null;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object');
  }
  return value as Record<string, unknown>;
}

describe('AiInfraService (BE-075)', () => {
  let prisma: PrismaService;
  let service: AiInfraService;
  let businessId: string;
  const claude = { createMessage: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = new ConfigService({ OPENAI_API_KEY: 'test-openai-key' });
    service = new AiInfraService(
      prisma,
      claude as unknown as ClaudeClient,
      config,
    );

    const business = await prisma.business.create({
      data: {
        name: 'AI Infra Test Biz',
        slug: `ai-infra-test-${Date.now()}`,
        aiRateLimitPerMinute: 2,
        aiMonthlyCostCapUsd: 1,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    claude.createMessage.mockClear();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    jest.mocked(axios.isAxiosError).mockReset();
  });

  afterAll(async () => {
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('completes a prompt and logs the call with an estimated cost', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    const text = await service.complete(businessId, 'hi there');
    expect(text).toBe('hello');

    const logs = await prisma.aiCallLog.findMany({ where: { businessId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].inputTokens).toBe(1000);
    expect(Number(logs[0].estimatedCostUsd)).toBeCloseTo(0.0035, 4);
  });

  it('refuses an unpriced model before calling the provider', async () => {
    await expect(
      service.createMessage(businessId, 'assistant_chat', {
        model: 'claude-opus-not-priced-here',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'AI_MODEL_COST_UNSUPPORTED',
      },
    });
    expect(claude.createMessage).not.toHaveBeenCalled();
  });

  it('links specialist AI usage to its real run and preserves the log if the run is removed', async () => {
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI usage test',
        slug: `specialist-ai-usage-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 1,
      },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: usageBusiness.id,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        status: 'completed',
      },
    });

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      await service.createMessage(
        usageBusiness.id,
        'inventory_agent',
        { messages: [{ role: 'user', content: 'Explain this saved review.' }] },
        [{ tool: 'read_reorder_suggestions', itemCount: 1 }],
        undefined,
        run.id,
      );

      const usage = await prisma.aiCallLog.findFirst({
        where: { specialistAgentRunId: run.id, businessId: usageBusiness.id },
      });
      expect(usage).not.toBeNull();
      expect(usage?.kind).toBe('inventory_agent');
      expect(usage?.inputTokens).toBe(1000);
      expect(usage?.outputTokens).toBe(500);
      expect(Number(usage?.estimatedCostUsd)).toBeCloseTo(0.0035, 4);
      expect(usage?.providerLatencyMs).toEqual(expect.any(Number));
      expect(usage?.providerLatencyMs).toBeGreaterThanOrEqual(0);
      expect(usage?.providerCallSucceeded).toBe(true);

      let invalidRunError: unknown;
      try {
        await service.createMessage(
          undefined,
          'inventory_agent',
          { messages: [{ role: 'user', content: 'Do not send this.' }] },
          undefined,
          undefined,
          run.id,
        );
      } catch (error) {
        invalidRunError = error;
      }
      expect(invalidRunError).toBeInstanceOf(AppException);
      if (invalidRunError instanceof AppException) {
        expect(invalidRunError.getResponse()).toEqual({
          code: 'SPECIALIST_AGENT_RUN_NOT_FOUND',
          message:
            'AI usage can only be attached to a specialist run in the same business.',
        });
      }
      expect(claude.createMessage).toHaveBeenCalledTimes(1);

      await prisma.specialistAgentRun.delete({ where: { id: run.id } });
      const retainedUsage = await prisma.aiCallLog.findUnique({
        where: { id: usage!.id },
      });
      expect(retainedUsage).not.toBeNull();
      expect(retainedUsage?.specialistAgentRunId).toBeNull();
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: usageBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
  });

  it('records a failed provider attempt without persisting prompt text or charging tokens', async () => {
    const failedBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI provider failure test',
        slug: `specialist-ai-provider-failure-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 1,
      },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: failedBusiness.id,
        agentKey: 'customer_intelligence',
        agentVersion: 'test-v1',
        moduleId: '7',
        status: 'completed',
      },
    });

    try {
      const providerError = {
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              type: 'invalid_request_error',
              message: 'Your credit balance is too low. Add more credits.',
            },
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      jest.mocked(axios.isAxiosError).mockReturnValue(true);
      claude.createMessage.mockRejectedValue(providerError);
      await expect(
        service.createMessage(
          failedBusiness.id,
          'customer_agent',
          {
            messages: [
              {
                role: 'user',
                content: 'sensitive test prompt must not be logged',
              },
            ],
          },
          undefined,
          undefined,
          run.id,
        ),
      ).rejects.toBe(providerError);

      const [attempt] = await prisma.aiCallLog.findMany({
        where: { businessId: failedBusiness.id },
      });
      expect(attempt).toMatchObject({
        kind: 'customer_agent',
        inputTokens: 0,
        outputTokens: 0,
        providerCallSucceeded: false,
        providerFailureCode: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
        specialistAgentRunId: run.id,
      });
      expect(Number(attempt.estimatedCostUsd)).toBe(0);
      expect(attempt.providerLatencyMs).toEqual(expect.any(Number));
      expect(attempt.providerFailureCode).toBe(
        'AI_PROVIDER_INSUFFICIENT_CREDIT',
      );
      expect(JSON.stringify(attempt)).not.toContain(
        'sensitive test prompt must not be logged',
      );
      expect(JSON.stringify(attempt)).not.toContain(
        'credit balance is too low',
      );
      expect(JSON.stringify(attempt)).not.toContain('Add more credits');
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: failedBusiness.id },
      });
      await prisma.specialistAgentRun.deleteMany({
        where: { businessId: failedBusiness.id },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: failedBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
  });

  it('reserves specialist budget for structured read-only tool turns', async () => {
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI tool turn test',
        slug: `specialist-ai-tool-turn-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: {
          'agents.commerceMaxRequestsPerMonth': 4,
          'agents.commerceMaxSpendUsdPerMonth': 1,
        },
      },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: usageBusiness.id,
        agentKey: 'autonomous_commerce',
        agentVersion: '1.0.0',
        moduleId: '29',
        status: 'running',
      },
    });

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const params = {
        system: 'Answer from registered read-only tools.',
        messages: [
          { role: 'user' as const, content: 'Check this product.' },
          {
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use' as const,
                id: 'tool-use-1',
                name: 'get_product',
                input: { productId: 'qa-product-id' },
              },
            ],
          },
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: 'tool-use-1',
                content: JSON.stringify({ summary: 'Product is active.' }),
              },
            ],
          },
        ],
        maxTokens: 100,
      };

      await service.createMessage(
        usageBusiness.id,
        'commerce_agent',
        params,
        [{ tool: 'get_product', outcome: 'succeeded' }],
        undefined,
        run.id,
      );

      expect(claude.createMessage).toHaveBeenCalledWith(params);
      const reservation =
        await prisma.specialistAgentAiRequest.findFirstOrThrow({
          where: { businessId: usageBusiness.id, runId: run.id },
        });
      expect(reservation.state).toBe('provider_completed');
      expect(
        await prisma.aiCallLog.count({
          where: { businessId: usageBusiness.id, specialistAgentRunId: run.id },
        }),
      ).toBe(1);
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.specialistAgentAiRequest.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.business.delete({ where: { id: usageBusiness.id } });
    }
  });

  it('enforces each specialist monthly request cap with reservations before provider calls', async () => {
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI monthly limit test',
        slug: `specialist-ai-monthly-limit-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: {
          'agents.inventoryMaxRequestsPerMonth': 1,
          'agents.commerceMaxRequestsPerMonth': 1,
        },
      },
    });
    const run = async (agentKey: string) =>
      prisma.specialistAgentRun.create({
        data: {
          businessId: usageBusiness.id,
          agentKey,
          agentVersion: '1.0.0',
          moduleId: agentKey === 'inventory_intelligence' ? '13' : '29',
          status: 'completed',
        },
      });
    const inventoryRunA = await run('inventory_intelligence');
    const inventoryRunB = await run('inventory_intelligence');
    const financeRun = await run('financial_intelligence');
    const commerceRunA = await run('autonomous_commerce');
    const commerceRunB = await run('autonomous_commerce');
    const seoRun = await run('seo_autopilot');

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const unlinkedRequestError = await service
        .createMessage(usageBusiness.id, 'inventory_agent', {
          messages: [{ role: 'user', content: 'Do not send without a run.' }],
        })
        .catch((error: unknown) => error);
      expect(unlinkedRequestError).toBeInstanceOf(AppException);
      expect(appErrorResponse(unlinkedRequestError)).toMatchObject({
        code: 'SPECIALIST_AGENT_RUN_REQUIRED',
      });
      expect(claude.createMessage).not.toHaveBeenCalled();

      const concurrentInventoryCalls = await Promise.allSettled([
        service.createMessage(
          usageBusiness.id,
          'inventory_agent',
          { messages: [{ role: 'user', content: 'Review inventory.' }] },
          undefined,
          undefined,
          inventoryRunA.id,
        ),
        service.createMessage(
          usageBusiness.id,
          'inventory_agent',
          { messages: [{ role: 'user', content: 'Review inventory again.' }] },
          undefined,
          undefined,
          inventoryRunB.id,
        ),
      ]);
      expect(
        concurrentInventoryCalls.filter(
          (result) => result.status === 'fulfilled',
        ),
      ).toHaveLength(1);
      const inventoryDenied = concurrentInventoryCalls.find(
        (result) => result.status === 'rejected',
      );
      expect(inventoryDenied?.status).toBe('rejected');
      const inventoryError: unknown =
        inventoryDenied?.status === 'rejected' ? inventoryDenied.reason : null;
      expect(inventoryError).toBeInstanceOf(AppException);
      expect(appErrorResponse(inventoryError)).toMatchObject({
        code: 'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
      });
      expect(claude.createMessage).toHaveBeenCalledTimes(1);

      await service.createMessage(
        usageBusiness.id,
        'finance_agent',
        { messages: [{ role: 'user', content: 'Review finance.' }] },
        undefined,
        undefined,
        financeRun.id,
      );

      claude.createMessage.mockRejectedValueOnce(
        new Error('provider unavailable'),
      );
      await expect(
        service.createMessage(
          usageBusiness.id,
          'commerce_agent',
          { messages: [{ role: 'user', content: 'Review commerce.' }] },
          undefined,
          undefined,
          commerceRunA.id,
        ),
      ).rejects.toThrow('provider unavailable');
      const commerceLimitError = await service
        .createMessage(
          usageBusiness.id,
          'commerce_agent',
          { messages: [{ role: 'user', content: 'Retry commerce.' }] },
          undefined,
          undefined,
          commerceRunB.id,
        )
        .catch((error: unknown) => error);
      expect(commerceLimitError).toBeInstanceOf(AppException);
      expect(appErrorResponse(commerceLimitError)).toMatchObject({
        code: 'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
      });
      await expect(
        service.createMessage(
          usageBusiness.id,
          'commerce_agent',
          { messages: [{ role: 'user', content: 'Retry commerce again.' }] },
          undefined,
          undefined,
          commerceRunB.id,
        ),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED' },
      });

      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        { messages: [{ role: 'user', content: 'Review SEO.' }] },
        undefined,
        undefined,
        seoRun.id,
      );
      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        { messages: [{ role: 'user', content: 'Review SEO again.' }] },
        undefined,
        undefined,
        seoRun.id,
      );

      const reservations = await prisma.specialistAgentAiRequest.findMany({
        where: { businessId: usageBusiness.id },
        orderBy: [{ agentKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(reservations).toHaveLength(5);
      expect(
        reservations.filter(
          (request) => request.agentKey === 'inventory_intelligence',
        ),
      ).toHaveLength(1);
      expect(
        reservations.filter(
          (request) => request.agentKey === 'financial_intelligence',
        ),
      ).toHaveLength(1);
      expect(
        reservations
          .filter((request) => request.agentKey === 'autonomous_commerce')
          .map((request) => request.state),
      ).toEqual(['provider_failed']);
      expect(
        reservations.filter((request) => request.agentKey === 'seo_autopilot'),
      ).toHaveLength(2);
      expect(claude.createMessage).toHaveBeenCalledTimes(5);

      const budgetEvents = await prisma.auditLog.findMany({
        where: {
          businessId: usageBusiness.id,
          action: 'agent.budget.limit_reached',
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(budgetEvents).toHaveLength(2);
      const eventPayloads = budgetEvents.map((event) => ({
        id: event.id,
        payload: jsonRecord(event.after),
      }));
      const inventoryBudgetEvent = eventPayloads.find(
        ({ payload }) => payload.agent_key === 'inventory_intelligence',
      );
      expect(inventoryBudgetEvent?.payload).toMatchObject({
        event_id: inventoryBudgetEvent?.id,
        event_name: 'agent.budget.limit_reached',
        source_module: '13',
        entity_version: '1.0.0',
        schema_version: 1,
        agent_key: 'inventory_intelligence',
        limit_code: 'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
      });
      expect(typeof inventoryBudgetEvent?.payload.entity_id).toBe('string');
      expect(typeof inventoryBudgetEvent?.payload.correlation_id).toBe(
        'string',
      );
      const commerceBudgetEvent = eventPayloads.find(
        ({ payload }) => payload.agent_key === 'autonomous_commerce',
      );
      expect(commerceBudgetEvent?.payload).toMatchObject({
        event_id: commerceBudgetEvent?.id,
        event_name: 'agent.budget.limit_reached',
        source_module: '29',
        agent_key: 'autonomous_commerce',
        limit_code: 'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
      });
      expect(JSON.stringify(budgetEvents)).not.toContain(
        'Review inventory again.',
      );
    } finally {
      await prisma.auditLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.business.delete({ where: { id: usageBusiness.id } });
    }
  });

  it('enforces a configurable specialist provider-request ceiling per run', async () => {
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI per-run limit test',
        slug: `specialist-ai-per-run-limit-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: { 'agents.specialistMaxProviderRequestsPerRun': 1 },
      },
    });
    const createRun = () =>
      prisma.specialistAgentRun.create({
        data: {
          businessId: usageBusiness.id,
          agentKey: 'seo_autopilot',
          agentVersion: '1.0.0',
          moduleId: '28',
          status: 'completed',
        },
      });
    const [firstRun, independentRun] = await Promise.all([
      createRun(),
      createRun(),
    ]);

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const params = {
        messages: [{ role: 'user' as const, content: 'Review SEO.' }],
      };
      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        params,
        undefined,
        undefined,
        firstRun.id,
      );

      const denied = await service
        .createMessage(
          usageBusiness.id,
          'seo_agent',
          params,
          undefined,
          undefined,
          firstRun.id,
        )
        .catch((error: unknown) => error);
      expect(denied).toBeInstanceOf(AppException);
      expect(appErrorResponse(denied)).toMatchObject({
        code: 'SPECIALIST_AGENT_RUN_REQUEST_LIMIT_REACHED',
      });
      expect(
        await prisma.auditLog.count({
          where: {
            businessId: usageBusiness.id,
            action: 'agent.budget.limit_reached',
          },
        }),
      ).toBe(1);

      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        params,
        undefined,
        undefined,
        independentRun.id,
      );
      expect(claude.createMessage).toHaveBeenCalledTimes(2);
      expect(
        await prisma.specialistAgentAiRequest.count({
          where: { businessId: usageBusiness.id },
        }),
      ).toBe(2);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.business.delete({ where: { id: usageBusiness.id } });
    }
  });

  it('refuses specialist provider requests above the configured output-token ceiling', async () => {
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI output-token limit test',
        slug: `specialist-ai-output-token-limit-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: { 'agents.specialistMaxOutputTokensPerRequest': 200 },
      },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: usageBusiness.id,
        agentKey: 'seo_autopilot',
        agentVersion: '1.0.0',
        moduleId: '28',
        status: 'completed',
      },
    });

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const denied = await service
        .createMessage(
          usageBusiness.id,
          'seo_agent',
          {
            maxTokens: 201,
            messages: [{ role: 'user', content: 'Review SEO.' }],
          },
          undefined,
          undefined,
          run.id,
        )
        .catch((error: unknown) => error);
      expect(denied).toBeInstanceOf(AppException);
      expect(appErrorResponse(denied)).toMatchObject({
        code: 'SPECIALIST_AGENT_OUTPUT_TOKEN_LIMIT_REACHED',
      });
      expect(claude.createMessage).not.toHaveBeenCalled();
      expect(
        await prisma.specialistAgentAiRequest.count({
          where: { businessId: usageBusiness.id },
        }),
      ).toBe(0);

      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        {
          maxTokens: 200,
          messages: [{ role: 'user', content: 'Review SEO.' }],
        },
        undefined,
        undefined,
        run.id,
      );
      expect(claude.createMessage).toHaveBeenCalledTimes(1);
      expect(
        await prisma.specialistAgentAiRequest.count({
          where: { businessId: usageBusiness.id },
        }),
      ).toBe(1);
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.business.delete({ where: { id: usageBusiness.id } });
    }
  });

  it('refuses specialist requests above the serialized input-byte ceiling before reserving or calling the provider', async () => {
    const maxInputBytes = 4096;
    const usageBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI input-size limit test',
        slug: `specialist-ai-input-size-limit-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: {
          'agents.specialistMaxInputBytesPerRequest': maxInputBytes,
        },
      },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: usageBusiness.id,
        agentKey: 'seo_autopilot',
        agentVersion: '1.0.0',
        moduleId: '28',
        status: 'completed',
      },
    });
    const inputBytes = (content: string) =>
      Buffer.byteLength(
        JSON.stringify({
          system: '',
          messages: [{ role: 'user', content }],
          tools: [],
        }),
        'utf8',
      );
    const fixedBytes = inputBytes('');
    const atLimit = 'x'.repeat(maxInputBytes - fixedBytes);
    expect(inputBytes(atLimit)).toBe(maxInputBytes);

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const denied = await service
        .createMessage(
          usageBusiness.id,
          'seo_agent',
          {
            messages: [{ role: 'user', content: `${atLimit}x` }],
          },
          undefined,
          undefined,
          run.id,
        )
        .catch((error: unknown) => error);
      expect(denied).toBeInstanceOf(AppException);
      expect(appErrorResponse(denied)).toMatchObject({
        code: 'SPECIALIST_AGENT_INPUT_SIZE_LIMIT_REACHED',
      });
      expect(claude.createMessage).not.toHaveBeenCalled();
      expect(
        await prisma.specialistAgentAiRequest.count({
          where: { businessId: usageBusiness.id },
        }),
      ).toBe(0);

      await service.createMessage(
        usageBusiness.id,
        'seo_agent',
        { messages: [{ role: 'user', content: atLimit }] },
        undefined,
        undefined,
        run.id,
      );
      expect(claude.createMessage).toHaveBeenCalledTimes(1);
      expect(
        await prisma.specialistAgentAiRequest.count({
          where: { businessId: usageBusiness.id },
        }),
      ).toBe(1);
    } finally {
      await prisma.aiCallLog.deleteMany({
        where: { businessId: usageBusiness.id },
      });
      await prisma.business.delete({ where: { id: usageBusiness.id } });
    }
  });

  it('blocks further calls once the per-minute rate limit is reached', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    await service.complete(businessId, 'call 1');
    // Rate limit is 2/min and the previous test already logged 1 call this minute.
    await expect(service.complete(businessId, 'call 2')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('enforces each specialist monthly spend cap using logged cost plus concurrent reservations', async () => {
    const budgetBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI spend budget test',
        slug: `specialist-ai-spend-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: { 'agents.inventoryMaxSpendUsdPerMonth': 0.0085 },
      },
    });
    const runs = await Promise.all(
      [0, 1].map(() =>
        prisma.specialistAgentRun.create({
          data: {
            businessId: budgetBusiness.id,
            agentKey: 'inventory_intelligence',
            agentVersion: '1.0.0',
            moduleId: '13',
            status: 'completed',
          },
        }),
      ),
    );

    try {
      claude.createMessage.mockResolvedValue(fakeResult());
      const prompt = 'Explain this saved inventory review.';
      await service.createMessage(
        budgetBusiness.id,
        'inventory_agent',
        { messages: [{ role: 'user', content: prompt }] },
        undefined,
        undefined,
        runs[0].id,
      );

      const denied = await service
        .createMessage(
          budgetBusiness.id,
          'inventory_agent',
          { messages: [{ role: 'user', content: prompt }] },
          undefined,
          undefined,
          runs[1].id,
        )
        .catch((error: unknown) => error);
      expect(denied).toBeInstanceOf(AppException);
      expect(appErrorResponse(denied)).toMatchObject({
        code: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
      });
      expect(claude.createMessage).toHaveBeenCalledTimes(1);

      const reservation =
        await prisma.specialistAgentAiRequest.findFirstOrThrow({
          where: { businessId: budgetBusiness.id },
        });
      expect(Number(reservation.reservedCostUsd)).toBeGreaterThan(0.0035);
      const logged = await prisma.aiCallLog.findFirstOrThrow({
        where: { businessId: budgetBusiness.id, kind: 'inventory_agent' },
      });
      expect(Number(logged.estimatedCostUsd)).toBeCloseTo(0.0035, 4);

      const budgetEvent = await prisma.auditLog.findFirstOrThrow({
        where: {
          businessId: budgetBusiness.id,
          action: 'agent.budget.limit_reached',
        },
      });
      expect(budgetEvent.after).toMatchObject({
        event_id: budgetEvent.id,
        event_name: 'agent.budget.limit_reached',
        source_module: '13',
        entity_id: runs[1].id,
        schema_version: 1,
        correlation_id: runs[1].id,
        agent_key: 'inventory_intelligence',
        limit_code: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
      });
    } finally {
      await prisma.auditLog.deleteMany({
        where: { businessId: budgetBusiness.id },
      });
      await prisma.aiCallLog.deleteMany({
        where: { businessId: budgetBusiness.id },
      });
      await prisma.business.delete({ where: { id: budgetBusiness.id } });
    }
  });

  it('keeps the conservative spend reservation after a failed specialist provider call', async () => {
    const budgetBusiness = await prisma.business.create({
      data: {
        name: 'Specialist AI failed spend reservation test',
        slug: `specialist-ai-failed-spend-${Date.now()}`,
        aiRateLimitPerMinute: 100,
        aiMonthlyCostCapUsd: 100,
        policies: { 'agents.commerceMaxSpendUsdPerMonth': 0.006 },
      },
    });
    const runs = await Promise.all(
      [0, 1].map(() =>
        prisma.specialistAgentRun.create({
          data: {
            businessId: budgetBusiness.id,
            agentKey: 'autonomous_commerce',
            agentVersion: '1.0.0',
            moduleId: '29',
            status: 'completed',
          },
        }),
      ),
    );

    try {
      claude.createMessage.mockRejectedValueOnce(
        new Error('provider unavailable'),
      );
      const params = {
        messages: [
          {
            role: 'user' as const,
            content: 'Review current commerce evidence.',
          },
        ],
      };
      await expect(
        service.createMessage(
          budgetBusiness.id,
          'commerce_agent',
          params,
          undefined,
          undefined,
          runs[0].id,
        ),
      ).rejects.toThrow('provider unavailable');

      const reservation =
        await prisma.specialistAgentAiRequest.findFirstOrThrow({
          where: { businessId: budgetBusiness.id },
        });
      expect(reservation.state).toBe('provider_failed');
      expect(Number(reservation.reservedCostUsd)).toBeGreaterThan(0);

      await expect(
        service.createMessage(
          budgetBusiness.id,
          'commerce_agent',
          params,
          undefined,
          undefined,
          runs[1].id,
        ),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED' },
      });
      expect(claude.createMessage).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { businessId: budgetBusiness.id },
      });
      await prisma.aiCallLog.deleteMany({
        where: { businessId: budgetBusiness.id },
      });
      await prisma.business.delete({ where: { id: budgetBusiness.id } });
    }
  });

  it('blocks further calls once the monthly cost cap is exceeded', async () => {
    const capBusiness = await prisma.business.create({
      data: {
        name: 'AI Cost Cap Test Biz',
        slug: `ai-cost-cap-test-${Date.now()}`,
        aiRateLimitPerMinute: 1000,
        aiMonthlyCostCapUsd: 0.01, // 2-decimal-place column (BE-075) — smallest representable cap
      },
    });

    claude.createMessage.mockResolvedValue(
      fakeResult({ inputTokens: 100_000, outputTokens: 100_000 }),
    );
    await service.complete(capBusiness.id, 'expensive call');

    await expect(
      service.complete(capBusiness.id, 'next call'),
    ).rejects.toBeInstanceOf(AppException);

    await prisma.aiCallLog.deleteMany({
      where: { businessId: capBusiness.id },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: capBusiness.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
  });

  it('logs per-version voice spend and blocks another call once that version reaches its monthly budget', async () => {
    const budgetBusiness = await prisma.business.create({
      data: {
        name: 'Voice Version Budget Test Biz',
        slug: `voice-version-budget-${Date.now()}`,
        aiRateLimitPerMinute: 1000,
        aiMonthlyCostCapUsd: 10,
      },
    });
    const agent = await prisma.voiceAiAgent.create({
      data: {
        businessId: budgetBusiness.id,
        name: 'QA budget agent',
        template: 'receptionist',
      },
    });
    const voiceAgentVersionId = randomUUID();
    await prisma.voiceAiAgentVersion.create({
      data: {
        id: voiceAgentVersionId,
        businessId: budgetBusiness.id,
        agentId: agent.id,
        version: 1,
        checksum: 'qa',
        config: { monthlyBudgetUsd: 0.01 },
      },
    });
    claude.createMessage.mockResolvedValue(fakeResult());

    const text = await service.complete(
      budgetBusiness.id,
      'test voice turn',
      0,
      'voice_entry',
      64,
      { voiceAgentVersionId, monthlyBudgetUsd: 0.01 },
    );
    expect(text).toBe('hello');
    const firstLog = await prisma.aiCallLog.findFirstOrThrow({
      where: { businessId: budgetBusiness.id, voiceAgentVersionId },
    });
    expect(Number(firstLog.estimatedCostUsd)).toBeGreaterThan(0);

    await prisma.aiCallLog.create({
      data: {
        businessId: budgetBusiness.id,
        voiceAgentVersionId,
        kind: 'voice_entry',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0.01,
      },
    });
    claude.createMessage.mockClear();

    await expect(
      service.complete(
        budgetBusiness.id,
        'over budget voice turn',
        0,
        'voice_entry',
        64,
        { voiceAgentVersionId, monthlyBudgetUsd: 0.01 },
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_AI_VERSION_BUDGET_REACHED' },
    });
    expect(claude.createMessage).not.toHaveBeenCalled();

    await prisma.voiceUsageRecord.deleteMany({
      where: { businessId: budgetBusiness.id },
    });
    await prisma.aiCallLog.deleteMany({
      where: { businessId: budgetBusiness.id },
    });
    await prisma.voiceAiAgentVersion.delete({
      where: { id: voiceAgentVersionId },
    });
    await prisma.voiceAiAgent.delete({ where: { id: agent.id } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: budgetBusiness.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
  });

  it('skips rate-limit/cost-cap checks entirely when no businessId is given (pre-signup calls)', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    const text = await service.complete(undefined, 'anonymous call');
    expect(text).toBe('hello');

    const logs = await prisma.aiCallLog.findMany({
      where: { businessId: null },
    });
    expect(logs.length).toBeGreaterThan(0);

    await prisma.aiCallLog.deleteMany({ where: { businessId: null } });
  });

  it('generateImage() calls the real OpenAI Images API and logs a flat per-image cost (UPD-BE-048)', async () => {
    // A dedicated business — the earlier tests in this file already exhaust `businessId`'s
    // 2-per-minute rate limit, and the window is real (60s), so reusing it here would be flaky.
    const imageBusiness = await prisma.business.create({
      data: { name: 'AI Image Test Biz', slug: `ai-image-test-${Date.now()}` },
    });

    mockedAxios.post.mockResolvedValue({
      data: { data: [{ url: 'https://example.com/generated.png' }] },
    });

    const result = await service.generateImage(
      imageBusiness.id,
      'a red bicycle',
    );
    expect(result.url).toBe('https://example.com/generated.png');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({ prompt: 'a red bicycle' }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-openai-key' },
      }),
    );

    const logs = await prisma.aiCallLog.findMany({
      where: { businessId: imageBusiness.id, kind: 'generate_image' },
    });
    expect(logs).toHaveLength(1);
    expect(Number(logs[0].estimatedCostUsd)).toBeCloseTo(0.04);
    expect(logs[0].providerLatencyMs).toEqual(expect.any(Number));
    expect(logs[0].providerLatencyMs).toBeGreaterThanOrEqual(0);
    expect(logs[0].providerCallSucceeded).toBe(true);

    await prisma.aiCallLog.deleteMany({
      where: { businessId: imageBusiness.id },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: imageBusiness.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
  });

  it('generateImage() still enforces the rate limit before calling OpenAI', async () => {
    const rateLimitedBusiness = await prisma.business.create({
      data: {
        name: 'AI Image Rate Limit Test Biz',
        slug: `ai-image-rate-${Date.now()}`,
        aiRateLimitPerMinute: 0,
      },
    });

    await expect(
      service.generateImage(rateLimitedBusiness.id, 'anything'),
    ).rejects.toBeInstanceOf(AppException);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: rateLimitedBusiness.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
  });

  describe('AI Settings feature toggles (UPD-BE-115)', () => {
    it('blocks a call whose kind maps to a toggled-off feature', async () => {
      const toggledOffBusiness = await prisma.business.create({
        data: {
          name: 'AI Toggle Off Test Biz',
          slug: `ai-toggle-off-${Date.now()}`,
          aiFeatureToggles: { reviewReplies: false },
        },
      });
      claude.createMessage.mockResolvedValue(fakeResult());

      await expect(
        service.complete(
          toggledOffBusiness.id,
          'draft a reply',
          0,
          'review_reply',
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(claude.createMessage).not.toHaveBeenCalled();

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: toggledOffBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });

    it('blocks workflow AI drafts when the owner disables workflow agents', async () => {
      const toggledOffBusiness = await prisma.business.create({
        data: {
          name: 'Workflow AI Toggle Off Test Biz',
          slug: `workflow-ai-toggle-off-${Date.now()}`,
          aiFeatureToggles: { workflowAgents: false },
        },
      });
      claude.createMessage.mockResolvedValue(fakeResult());

      await expect(
        service.createMessage(toggledOffBusiness.id, 'workflow_agent', {
          messages: [{ role: 'user', content: 'Draft a short note.' }],
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(claude.createMessage).not.toHaveBeenCalled();

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: toggledOffBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });

    it('blocks meeting transcription summaries when the owner disables the meeting AI feature', async () => {
      const toggledOffBusiness = await prisma.business.create({
        data: {
          name: 'Meeting AI Toggle Off Test Biz',
          slug: `meeting-ai-toggle-off-${Date.now()}`,
          aiFeatureToggles: { voiceMeetingSummary: false },
        },
      });
      claude.createMessage.mockResolvedValue(fakeResult());

      await expect(
        service.complete(
          toggledOffBusiness.id,
          'Summarize a consented meeting transcript.',
          0,
          'voice_meeting_summary',
        ),
      ).rejects.toMatchObject({
        response: { code: 'AI_FEATURE_DISABLED' },
      });
      expect(claude.createMessage).not.toHaveBeenCalled();

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: toggledOffBusiness.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });

    it('allows a call whose kind has no toggle mapping, regardless of other feature toggles', async () => {
      const business = await prisma.business.create({
        data: {
          name: 'AI Untracked Kind Test Biz',
          slug: `ai-untracked-kind-${Date.now()}`,
          aiFeatureToggles: { reviewReplies: false },
        },
      });
      claude.createMessage.mockResolvedValue(fakeResult());

      const text = await service.complete(business.id, 'anything', 0);
      expect(text).toBe('hello');

      await prisma.aiCallLog.deleteMany({ where: { businessId: business.id } });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: business.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });

    it('allows a mapped kind when the toggle is left unset (defaults to enabled)', async () => {
      const business = await prisma.business.create({
        data: {
          name: 'AI Default-Enabled Test Biz',
          slug: `ai-default-enabled-${Date.now()}`,
        },
      });
      claude.createMessage.mockResolvedValue(fakeResult());

      const text = await service.complete(
        business.id,
        'draft a reply',
        0,
        'review_reply',
      );
      expect(text).toBe('hello');

      await prisma.aiCallLog.deleteMany({ where: { businessId: business.id } });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: business.id } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });
  });
});
