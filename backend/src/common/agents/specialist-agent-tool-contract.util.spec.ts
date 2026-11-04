import { AppException } from '../filters/app.exception';
import {
  normalizeSpecialistAgentToolInput,
  normalizeSpecialistAgentToolOutput,
  specialistAgentToolVersion,
  specialistAgentToolInputSchema,
  type SpecialistAgentToolContract,
} from './specialist-agent-tool-contract.util';

const contract: SpecialistAgentToolContract = {
  key: 'get_order',
  label: 'Get order',
  description: 'Read one order by its canonical ID.',
  inputs: ['orderId', 'branchId'],
  requiredInputs: ['orderId'],
};

describe('specialist agent tool contract', () => {
  it('builds a strict provider schema from the execution contract', () => {
    expect(specialistAgentToolInputSchema(contract)).toEqual({
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        branchId: { type: 'string' },
      },
      required: ['orderId'],
      additionalProperties: false,
    });
  });

  it('normalizes registered string fields and requires non-empty required inputs', () => {
    expect(
      normalizeSpecialistAgentToolInput(
        contract,
        { branchId: ' branch-1 ', orderId: ' order-1 ' },
        { errorCode: 'TOOL_INPUT_INVALID' },
      ),
    ).toEqual({ branchId: 'branch-1', orderId: 'order-1' });

    expect(() =>
      normalizeSpecialistAgentToolInput(
        contract,
        { orderId: '   ' },
        { errorCode: 'TOOL_INPUT_INVALID' },
      ),
    ).toThrow(AppException);
  });

  it.each([
    ['non-object input', ['order-1']],
    ['unregistered field', { orderId: 'order-1', sql: 'select *' }],
    ['non-string field', { orderId: 1 }],
    ['missing required field', { branchId: 'branch-1' }],
  ])('rejects %s before a tool handler can receive it', (_label, input) => {
    try {
      normalizeSpecialistAgentToolInput(contract, input, {
        errorCode: 'TOOL_INPUT_INVALID',
      });
      throw new Error('Expected the registered tool contract to reject input');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toMatchObject({
        code: 'TOOL_INPUT_INVALID',
      });
    }
  });

  it('rejects contracts whose required fields are not registered', () => {
    expect(() =>
      specialistAgentToolInputSchema({
        ...contract,
        requiredInputs: ['missing'],
      }),
    ).toThrow(AppException);
  });

  it('defaults tool contracts to version 1 and rejects invalid versions', () => {
    expect(specialistAgentToolVersion(contract)).toBe(1);
    expect(specialistAgentToolVersion({ ...contract, toolVersion: 2 })).toBe(2);
    expect(() =>
      specialistAgentToolInputSchema({ ...contract, toolVersion: 0 }),
    ).toThrow(AppException);
  });

  it('rejects unsafe input names before producing or normalizing a schema', () => {
    const unsafeContract = {
      ...contract,
      inputs: ['__proto__'],
      requiredInputs: ['__proto__'],
    };

    expect(() => specialistAgentToolInputSchema(unsafeContract)).toThrow(
      AppException,
    );
    expect(() =>
      normalizeSpecialistAgentToolInput(
        unsafeContract,
        JSON.parse('{"__proto__":"polluted"}') as unknown,
        { errorCode: 'TOOL_INPUT_INVALID' },
      ),
    ).toThrow(AppException);
  });

  it('enforces per-field and serialized-size limits', () => {
    expect(() =>
      normalizeSpecialistAgentToolInput(
        contract,
        { orderId: 'a'.repeat(5) },
        { errorCode: 'TOOL_INPUT_INVALID', maxFieldLength: 4 },
      ),
    ).toThrow(AppException);

    expect(() =>
      normalizeSpecialistAgentToolInput(
        contract,
        { orderId: 'order-1', branchId: 'branch-1' },
        { errorCode: 'TOOL_INPUT_INVALID', maxInputBytes: 10 },
      ),
    ).toThrow(AppException);
  });

  it('round-trips bounded JSON results and rejects values JSON would lose or corrupt', () => {
    expect(
      normalizeSpecialistAgentToolOutput(
        contract,
        { result: ['ok', 2], observedAt: new Date('2026-11-04T00:00:00.000Z') },
        { errorCode: 'TOOL_OUTPUT_INVALID' },
      ),
    ).toEqual({
      result: ['ok', 2],
      observedAt: '2026-11-04T00:00:00.000Z',
    });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const value of [
      undefined,
      { missing: undefined },
      [undefined],
      { amount: Number.NaN },
      { count: 1n },
      { hidden: () => 'not JSON' },
      circular,
    ]) {
      expect(() =>
        normalizeSpecialistAgentToolOutput(contract, value, {
          errorCode: 'TOOL_OUTPUT_INVALID',
        }),
      ).toThrow(AppException);
    }
  });

  it('refuses an oversized result before it can be included in model context', () => {
    try {
      normalizeSpecialistAgentToolOutput(
        contract,
        { summary: 'x'.repeat(101) },
        { errorCode: 'TOOL_OUTPUT_INVALID', maxOutputBytes: 100 },
      );
      throw new Error('Expected an oversized tool result to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getResponse()).toMatchObject({
        code: 'TOOL_OUTPUT_INVALID',
      });
    }
  });
});
