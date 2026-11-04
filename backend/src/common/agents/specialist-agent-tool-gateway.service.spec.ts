import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../filters/app.exception';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service';
import {
  SpecialistAgentToolGatewayService,
  type RegisteredSpecialistAgentTool,
} from './specialist-agent-tool-gateway.service';

const readTool: RegisteredSpecialistAgentTool = {
  key: 'get_customer_summary',
  toolVersion: 2,
  label: 'Get customer summary',
  description: 'Read a customer summary from its canonical source.',
  inputs: ['customerId'],
  requiredInputs: ['customerId'],
  riskClass: 'READ_ONLY',
  executable: true,
  exposedToReadOnlyAssistant: true,
  screen: '/customers',
};

const writeTool: RegisteredSpecialistAgentTool = {
  key: 'create_follow_up',
  label: 'Create follow-up',
  description: 'Create a follow-up after owner approval.',
  inputs: ['customerId'],
  requiredInputs: ['customerId'],
  riskClass: 'WRITE_REVERSIBLE',
  executable: true,
  approvalSupported: true,
  approvalActionType: 'create_follow_up',
};

async function expectAppException(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getResponse()).toMatchObject({ code });
  }
}

describe('SpecialistAgentToolGatewayService', () => {
  let gateway: SpecialistAgentToolGatewayService;
  let upsert: jest.MockedFunction<
    (args: Prisma.SpecialistAgentToolCallUpsertArgs) => Promise<unknown>
  >;
  let findApproval: jest.MockedFunction<
    (args: Prisma.SpecialistAgentActionFindFirstArgs) => Promise<unknown>
  >;
  let countToolCalls: jest.MockedFunction<
    (args: Prisma.SpecialistAgentToolCallCountArgs) => Promise<number>
  >;
  let handler: jest.Mock;

  const fakeTenantPrisma = (
    findBusiness = jest.fn().mockResolvedValue({ policies: {} }),
  ) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'run-1' }]),
      business: { findUnique: findBusiness },
      specialistAgentToolCall: { upsert, count: countToolCalls },
      specialistAgentAction: { findFirst: findApproval },
    };
    return {
      client: {
        ...tx,
        $transaction: async (
          callback: (transactionClient: typeof tx) => Promise<unknown>,
        ) => callback(tx),
      },
    } as unknown as TenantPrismaService;
  };

  beforeEach(() => {
    upsert = jest
      .fn<Promise<unknown>, [Prisma.SpecialistAgentToolCallUpsertArgs]>()
      .mockResolvedValue({});
    findApproval = jest
      .fn<Promise<unknown>, [Prisma.SpecialistAgentActionFindFirstArgs]>()
      .mockResolvedValue(null);
    countToolCalls = jest
      .fn<Promise<number>, [Prisma.SpecialistAgentToolCallCountArgs]>()
      .mockResolvedValue(0);
    gateway = new SpecialistAgentToolGatewayService(fakeTenantPrisma());
    handler = jest.fn().mockResolvedValue({
      output: { customerId: 'customer-1', orders: 2 },
      status: 'succeeded',
      summary: 'Customer has two recent orders.',
      outputResourceType: 'Customer',
      outputResourceId: 'customer-1',
    });
    gateway.registerAgentTools(
      'customer_intelligence',
      '7',
      [readTool, writeTool],
      handler,
    );
  });

  const context = {
    agentKey: 'customer_intelligence' as const,
    moduleId: '7',
    businessId: 'business-1',
    actorUserId: 'user-1',
    runId: 'run-1',
    correlationId: 'correlation-1',
    sequence: 1,
  };

  it('uses registered contracts for provider schemas and read-only exposure', () => {
    expect(
      gateway.schemasForAgent(
        'customer_intelligence',
        (tool) => tool.exposedToReadOnlyAssistant === true,
      ),
    ).toEqual([
      {
        name: 'get_customer_summary',
        description: readTool.description,
        input_schema: {
          type: 'object',
          properties: { customerId: { type: 'string' } },
          required: ['customerId'],
          additionalProperties: false,
        },
      },
    ]);
    expect(
      gateway.toolForAgent('customer_intelligence', 'create_follow_up'),
    ).toMatchObject({
      riskClass: 'WRITE_REVERSIBLE',
      approvalSupported: true,
      approvalActionType: 'create_follow_up',
    });
  });

  it('authorizes, normalizes, bounds, and records a redacted read-only call', async () => {
    const authorize = jest.fn().mockResolvedValue(undefined);
    const result = await gateway.execute({
      ...context,
      toolKey: readTool.key,
      input: { customerId: ' private-customer@example.com ' },
      mode: 'read_only',
      authorize,
    });

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ ...context }),
      readTool,
      { customerId: 'private-customer@example.com' },
    );
    expect(result).toMatchObject({
      output: { customerId: 'customer-1', orders: 2 },
      status: 'succeeded',
      summary: 'Customer has two recent orders.',
      outputResourceType: 'Customer',
      outputResourceId: 'customer-1',
    });

    expect(upsert.mock.calls[0][0].create.status).toBe('running');
    const args = upsert.mock.calls.at(-1)![0];
    expect(args.create).toMatchObject({
      businessId: 'business-1',
      agentKey: 'customer_intelligence',
      moduleId: '7',
      toolKey: readTool.key,
      toolVersion: 2,
      status: 'succeeded',
      inputFields: ['customerId'],
      outputResourceType: 'Customer',
      outputResourceId: 'customer-1',
    });
    expect(JSON.stringify(args)).not.toContain('private-customer@example.com');
  });

  it('blocks write tools in read-only mode and requires an approval ID for actions', async () => {
    const authorize = jest.fn().mockResolvedValue(undefined);
    await expectAppException(
      gateway.execute({
        ...context,
        toolKey: writeTool.key,
        input: { customerId: 'customer-1' },
        mode: 'read_only',
        authorize,
      }),
      'SPECIALIST_AGENT_TOOL_NOT_ALLOWED',
    );
    await expect(
      gateway.execute({
        ...context,
        toolKey: writeTool.key,
        input: { customerId: 'customer-1' },
        mode: 'approved_action',
        authorize,
      }),
    ).rejects.toBeInstanceOf(AppException);

    expect(handler).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map(([args]) => args.create.status)).toEqual([
      'blocked',
      'blocked',
    ]);
    expect(findApproval).not.toHaveBeenCalled();
  });

  it('requires a matching persisted approval for an approved action', async () => {
    const authorize = jest.fn().mockResolvedValue(undefined);
    findApproval.mockResolvedValueOnce({ id: 'approval-1' });

    await gateway.execute({
      ...context,
      toolKey: writeTool.key,
      input: { customerId: 'customer-1' },
      mode: 'approved_action',
      approvalId: 'approval-1',
      authorize,
    });

    expect(findApproval.mock.calls[0][0].where).toMatchObject({
      id: 'approval-1',
      businessId: 'business-1',
      runId: 'run-1',
      agentKey: 'customer_intelligence',
      moduleId: '7',
      actionType: 'create_follow_up',
      state: 'approved',
    });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('refuses an action if no matching persisted approval exists', async () => {
    const authorize = jest.fn().mockResolvedValue(undefined);
    await expectAppException(
      gateway.execute({
        ...context,
        toolKey: writeTool.key,
        input: { customerId: 'customer-1' },
        mode: 'approved_action',
        approvalId: 'approval-1',
        authorize,
      }),
      'SPECIALIST_AGENT_APPROVAL_REQUIRED',
    );
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(upsert.mock.calls.map(([args]) => args.create.status)).toEqual([
      'running',
      'refused',
    ]);
  });

  it('records authorization refusals without running the handler', async () => {
    const authorize = jest
      .fn()
      .mockRejectedValue(
        new AppException(
          'AGENT_MODULE_DISABLED',
          'This agent is disabled.',
          HttpStatus.FORBIDDEN,
        ),
      );

    await expectAppException(
      gateway.execute({
        ...context,
        toolKey: readTool.key,
        input: { customerId: 'private-customer-id' },
        mode: 'read_only',
        authorize,
      }),
      'AGENT_MODULE_DISABLED',
    );

    expect(handler).not.toHaveBeenCalled();
    expect(upsert.mock.calls.at(-1)?.[0].create).toMatchObject({
      status: 'refused',
      errorCode: 'AGENT_MODULE_DISABLED',
    });
    expect(JSON.stringify(upsert.mock.calls[0][0])).not.toContain(
      'private-customer-id',
    );
  });

  it('records and refuses a tool call after the configured per-run limit', async () => {
    countToolCalls.mockResolvedValue(1);
    const findBusiness = jest.fn().mockResolvedValue({
      policies: {
        'agents.customerMaxToolCallsPerRun': 1,
        'agents.maxToolCallsPerRun': 20,
      },
    });
    gateway = new SpecialistAgentToolGatewayService(
      fakeTenantPrisma(findBusiness),
    );
    gateway.registerAgentTools(
      'customer_intelligence',
      '7',
      [readTool],
      handler,
    );

    await expectAppException(
      gateway.execute({
        ...context,
        sequence: 2,
        toolKey: readTool.key,
        input: { customerId: 'customer-1' },
        mode: 'read_only',
        authorize: jest.fn().mockResolvedValue(undefined),
      }),
      'SPECIALIST_AGENT_TOOL_CALL_LIMIT_REACHED',
    );

    expect(countToolCalls.mock.calls.at(-1)?.[0].where).toMatchObject({
      businessId: 'business-1',
      runId: 'run-1',
      agentKey: 'customer_intelligence',
    });
    expect(upsert.mock.calls.at(-1)?.[0].create).toMatchObject({
      sequence: 2,
      status: 'blocked',
      errorCode: 'SPECIALIST_AGENT_TOOL_CALL_LIMIT_REACHED',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects registrations for another agent module and duplicate agent registrations', () => {
    const emptyGateway = new SpecialistAgentToolGatewayService({
      client: {
        specialistAgentToolCall: { upsert },
        specialistAgentAction: { findFirst: findApproval },
      },
    } as unknown as TenantPrismaService);
    expect(() =>
      emptyGateway.registerAgentTools(
        'customer_intelligence',
        '29',
        [readTool],
        handler,
      ),
    ).toThrow(AppException);

    expect(() =>
      gateway.registerAgentTools(
        'customer_intelligence',
        '7',
        [readTool],
        handler,
      ),
    ).toThrow(AppException);
  });

  it('records and rejects output that exceeds the bounded tool contract', async () => {
    handler.mockResolvedValueOnce({
      output: { text: 'x'.repeat(64_001) },
      status: 'succeeded',
    });
    await expectAppException(
      gateway.execute({
        ...context,
        toolKey: readTool.key,
        input: { customerId: 'customer-1' },
        mode: 'read_only',
        authorize: jest.fn().mockResolvedValue(undefined),
      }),
      'SPECIALIST_AGENT_TOOL_OUTPUT_INVALID',
    );
    expect(upsert.mock.calls.map(([args]) => args.create.status)).toEqual([
      'running',
      'failed',
    ]);
  });
});
