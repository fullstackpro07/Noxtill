import { Readable } from 'stream';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AssistantService } from './assistant.service';
import { ClaudeClient } from '../ai/claude.client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

function sseStream(
  events: { type: string; [key: string]: unknown }[],
): Readable {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return Readable.from([Buffer.from(body)]);
}

// Factories, not shared stream instances — a Readable can only be consumed
// once, and each test needs its own fresh copy of these turns.
function toolUseTurn(): Readable {
  return sseStream([
    { type: 'message_start', message: { usage: { input_tokens: 200 } } },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool_1',
        name: 'get_revenue_today',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 10 },
    },
    { type: 'message_stop' },
  ]);
}

function toolUseTurnFor(
  toolUseId: string,
  name: string,
  inputJson: string,
): Readable {
  return sseStream([
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: toolUseId, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: inputJson },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ]);
}

function finalTurn(): Readable {
  return sseStream([
    { type: 'message_start', message: { usage: { input_tokens: 300 } } },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Revenue today is $200.' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 8 },
    },
    { type: 'message_stop' },
  ]);
}

describe('AssistantService (BE-074)', () => {
  let prisma: PrismaService;
  let service: AssistantService;
  let businessId: string;
  const helpSlug = `assistant-help-test-${Date.now()}`;
  const claude = { streamMessage: jest.fn() };
  const aiInfra = {
    checkGuardrails: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AssistantService(
      tenantPrisma,
      prisma,
      claude as unknown as ClaudeClient,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Assistant Test Biz',
        slug: `assistant-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 200,
        subtotal: 200,
        createdAt: new Date(),
      },
    });

    await prisma.helpArticle.create({
      data: {
        slug: helpSlug,
        title: 'How the frobnicator widget works',
        body: 'The frobnicator widget frobnicates your gizmos automatically every night at midnight.',
        url: `/help/${helpSlug}`,
      },
    });
  });

  afterEach(() => {
    claude.streamMessage.mockClear();
    aiInfra.checkGuardrails.mockClear();
    aiInfra.recordUsage.mockClear();
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.helpArticle.delete({ where: { slug: helpSlug } });
    await prisma.$disconnect();
  });

  it('executes a real tool call server-side, tenant-locked, and streams the final grounded answer', async () => {
    claude.streamMessage
      .mockResolvedValueOnce(toolUseTurn())
      .mockResolvedValueOnce(finalTurn());

    const deltas: string[] = [];
    const result = await service.chat(
      businessId,
      'How much revenue today?',
      (text) => deltas.push(text),
    );

    expect(deltas.join('')).toBe('Revenue today is $200.');
    expect(result.text).toBe('Revenue today is $200.');
    expect(result.toolCalls).toEqual([
      {
        name: 'get_revenue_today',
        input: {},
        output: { revenue: 200, orders: 1 },
      },
    ]);
    expect(aiInfra.checkGuardrails).toHaveBeenCalledTimes(2);
    expect(claude.streamMessage).toHaveBeenCalledTimes(2);
  });

  it('never lets the model override which business a tool reads from', async () => {
    claude.streamMessage.mockResolvedValueOnce(
      sseStream([
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool_2',
            name: 'find_customer_by_phone',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"phone":"+1000"}',
          },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]),
    );
    claude.streamMessage.mockResolvedValueOnce(finalTurn());

    const result = await service.chat(businessId, 'Find customer +1000');
    expect(result.toolCalls[0]).toEqual({
      name: 'find_customer_by_phone',
      input: { phone: '+1000' },
      output: { found: false },
    });
  });

  it('search_help_docs retrieves a real help article for a matching query', async () => {
    claude.streamMessage.mockResolvedValueOnce(
      toolUseTurnFor('tool_3', 'search_help_docs', '{"query":"frobnicator"}'),
    );
    claude.streamMessage.mockResolvedValueOnce(finalTurn());

    const result = await service.chat(
      businessId,
      'How does the frobnicator work?',
    );
    const output = result.toolCalls[0].output as {
      found: boolean;
      passages: { title: string; url: string }[];
    };

    expect(result.toolCalls[0].name).toBe('search_help_docs');
    expect(output.found).toBe(true);
    expect(output.passages[0]).toEqual(
      expect.objectContaining({
        title: 'How the frobnicator widget works',
        url: `/help/${helpSlug}`,
      }),
    );
  });

  it('search_help_docs returns found:false when nothing relevant is indexed', async () => {
    claude.streamMessage.mockResolvedValueOnce(
      toolUseTurnFor(
        'tool_4',
        'search_help_docs',
        '{"query":"zzqx unrelated nonsense topic"}',
      ),
    );
    claude.streamMessage.mockResolvedValueOnce(finalTurn());

    const result = await service.chat(
      businessId,
      'zzqx unrelated nonsense topic',
    );
    expect(result.toolCalls[0].output).toEqual({ found: false });
  });

  it('wraps a Claude stream failure as a clean AI_UNAVAILABLE error instead of a raw message', async () => {
    claude.streamMessage.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );

    await expect(service.chat(businessId, 'test')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  describe("today's bookings tool", () => {
    let productId: string;
    let customerId: string;
    let appointmentId: string;

    beforeAll(async () => {
      const product = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Assistant Test Haircut',
          durationMin: 30,
        },
      });
      productId = product.id;

      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: 'Assistant Test Customer',
          phone: `+1555${Date.now()}`,
        },
      });
      customerId = customer.id;

      const startsAt = new Date();
      const appointment = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: productId,
          customerId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          status: 'confirmed',
        },
      });
      appointmentId = appointment.id;
    });

    afterAll(async () => {
      await prisma.appointment.delete({ where: { id: appointmentId } });
      await prisma.customer.delete({ where: { id: customerId } });
      await prisma.product.delete({ where: { id: productId } });
    });

    it('reflects a real appointment starting today', async () => {
      claude.streamMessage.mockResolvedValueOnce(
        toolUseTurnFor('tool_5', 'get_todays_bookings', '{}'),
      );
      claude.streamMessage.mockResolvedValueOnce(finalTurn());

      const result = await service.chat(businessId, "What's on today?");
      expect(result.toolCalls[0]).toEqual({
        name: 'get_todays_bookings',
        input: {},
        output: { count: 1 },
      });
    });
  });
});
