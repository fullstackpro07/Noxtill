import { HttpStatus } from '@nestjs/common';
import { AppException } from '../filters/app.exception';

export interface SpecialistAgentToolContract {
  key: string;
  /** Version of the validated input/behavior contract; defaults to version 1. */
  toolVersion?: number;
  label: string;
  description: string;
  inputs: readonly string[];
  requiredInputs?: readonly string[];
}

export interface SpecialistAgentToolInputLimits {
  errorCode: string;
  requiredErrorCode?: string;
  maxFieldLength?: number;
  maxInputBytes?: number;
}

export interface SpecialistAgentToolOutputLimits {
  errorCode: string;
  maxOutputBytes?: number;
}

const DEFAULT_MAX_FIELD_LENGTH = 2_000;
const DEFAULT_MAX_INPUT_BYTES = 8_192;
const DEFAULT_MAX_OUTPUT_BYTES = 64_000;

function assertValidToolContract(tool: SpecialistAgentToolContract): void {
  const inputNames = [...tool.inputs];
  const requiredInputs = [...(tool.requiredInputs ?? [])];
  if (
    (tool.toolVersion !== undefined &&
      (!Number.isSafeInteger(tool.toolVersion) || tool.toolVersion < 1)) ||
    inputNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) ||
    new Set(inputNames).size !== inputNames.length ||
    new Set(requiredInputs).size !== requiredInputs.length ||
    requiredInputs.some((input) => !inputNames.includes(input))
  ) {
    throw new AppException(
      'SPECIALIST_AGENT_TOOL_CONTRACT_INVALID',
      `The registered input contract for ${tool.key} is inconsistent.`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export function specialistAgentToolVersion(
  tool: SpecialistAgentToolContract,
): number {
  assertValidToolContract(tool);
  return tool.toolVersion ?? 1;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Builds the provider function schema from the same registered contract used by execution. */
export function specialistAgentToolInputSchema(
  tool: SpecialistAgentToolContract,
) {
  assertValidToolContract(tool);
  const inputNames = [...tool.inputs];
  const requiredInputs = [...(tool.requiredInputs ?? [])];

  return {
    type: 'object',
    properties: Object.fromEntries(
      inputNames.map((name) => [name, { type: 'string' }]),
    ),
    ...(requiredInputs.length > 0 ? { required: requiredInputs } : {}),
    additionalProperties: false,
  };
}

/** Strictly validate provider-supplied arguments before a registered handler sees them. */
export function normalizeSpecialistAgentToolInput(
  tool: SpecialistAgentToolContract,
  input: unknown,
  limits: SpecialistAgentToolInputLimits,
): Record<string, string> {
  assertValidToolContract(tool);
  const maxFieldLength = limits.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH;
  const maxInputBytes = limits.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (!isPlainRecord(input)) {
    throw new AppException(
      limits.errorCode,
      'Tool input must be an object containing only the registered string fields.',
      HttpStatus.BAD_REQUEST,
    );
  }

  const allowedFields = new Set(tool.inputs);
  const normalized: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [name, value] of Object.entries(input)) {
    if (!allowedFields.has(name)) {
      throw new AppException(
        limits.errorCode,
        `Field ${name} is not registered for the ${tool.label} tool.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (typeof value !== 'string') {
      throw new AppException(
        limits.errorCode,
        `Field ${name} must be text.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (value.length > maxFieldLength) {
      throw new AppException(
        limits.errorCode,
        `Field ${name} exceeds the ${maxFieldLength}-character limit.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    normalized[name] = value.trim();
  }

  for (const name of tool.requiredInputs ?? []) {
    if (!normalized[name]) {
      throw new AppException(
        limits.requiredErrorCode ?? limits.errorCode,
        `Field ${name} is required for the ${tool.label} tool.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  const ordered = Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  if (Buffer.byteLength(JSON.stringify(ordered), 'utf8') > maxInputBytes) {
    throw new AppException(
      limits.errorCode,
      `Tool input exceeds the ${maxInputBytes}-byte limit.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return ordered;
}

/**
 * Require a canonical tool result to be JSON-safe and bounded before it leaves the owning service.
 * Returning the round-tripped value prevents non-JSON runtime objects from leaking across that
 * boundary. Provider/tool output remains data, never executable instructions.
 */
export function normalizeSpecialistAgentToolOutput(
  tool: SpecialistAgentToolContract,
  output: unknown,
  limits: SpecialistAgentToolOutputLimits,
): unknown {
  assertValidToolContract(tool);
  const maxOutputBytes = limits.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new AppException(
      'SPECIALIST_AGENT_TOOL_CONTRACT_INVALID',
      `The output limit for ${tool.key} is invalid.`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(output, (_key, value: unknown) => {
      if (
        typeof value === 'undefined' ||
        typeof value === 'bigint' ||
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        (typeof value === 'number' && !Number.isFinite(value))
      ) {
        throw new TypeError('Tool output contains a non-JSON value.');
      }
      return value;
    });
  } catch {
    throw new AppException(
      limits.errorCode,
      `The ${tool.label} tool returned a result that cannot be safely represented as JSON.`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, 'utf8') > maxOutputBytes
  ) {
    throw new AppException(
      limits.errorCode,
      `The ${tool.label} tool result is empty or exceeds the ${maxOutputBytes}-byte safety limit.`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new AppException(
      limits.errorCode,
      `The ${tool.label} tool returned a result that could not be read safely.`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}
