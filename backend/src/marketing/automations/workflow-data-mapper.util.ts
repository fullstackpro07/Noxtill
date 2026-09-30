export const WORKFLOW_DATA_MAPPER_TRANSFORMS = [
  'copy',
  'string',
  'number',
  'boolean',
  'iso_date',
  'trim',
  'lowercase',
  'uppercase',
  'json_string',
] as const;

export type WorkflowDataMapperTransform =
  (typeof WORKFLOW_DATA_MAPPER_TRANSFORMS)[number];

export interface WorkflowDataMapping {
  sourcePath: string;
  targetPath: string;
  transform?: WorkflowDataMapperTransform;
  required?: boolean;
  fallback?: unknown;
}

export interface WorkflowDataMapperIssue {
  path: string;
  code: string;
  message: string;
}

export interface WorkflowDataMapperPreview {
  valid: boolean;
  mappedFields: number;
  mappedData: Record<string, unknown>;
  errors: WorkflowDataMapperIssue[];
  warnings: WorkflowDataMapperIssue[];
}

const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);
const SOURCE_SEGMENT = /^(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*)$/;
const TARGET_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const STRICT_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const MAX_MAPPINGS = 100;
const MAX_PATH_DEPTH = 24;
const MAX_SOURCE_BYTES = 65_536;
const MAX_SOURCE_VALUES = 10_000;
const MAX_JSON_DEPTH = 20;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPathParts(path: string, target: boolean): string[] | null {
  if (path.length === 0 || path.length > 256) return null;
  const parts = path.split('.');
  if (
    parts.length > MAX_PATH_DEPTH ||
    parts.some(
      (part) =>
        FORBIDDEN_PATH_SEGMENTS.has(part) ||
        !(target ? TARGET_SEGMENT : SOURCE_SEGMENT).test(part),
    )
  ) {
    return null;
  }
  return parts;
}

function getSourceValue(
  source: Record<string, unknown>,
  path: string,
): { found: boolean; value?: unknown } {
  const parts = getPathParts(path, false);
  if (!parts) return { found: false };
  let value: unknown = source;
  for (const part of parts) {
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(part)) return { found: false };
      const index = Number(part);
      if (index >= value.length) return { found: false };
      value = value[index];
    } else if (
      isObjectRecord(value) &&
      Object.prototype.hasOwnProperty.call(value, part)
    ) {
      value = value[part];
    } else {
      return { found: false };
    }
  }
  return { found: value !== undefined, value };
}

function validateSourceSize(source: Record<string, unknown>): string | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(source);
  } catch {
    return 'Source must be valid JSON data.';
  }
  if (serialized.length > MAX_SOURCE_BYTES) {
    return `Source data must be ${MAX_SOURCE_BYTES} characters or fewer.`;
  }

  let values = 0;
  const ancestors = new WeakSet<object>();
  const visit = (value: unknown, depth: number): string | null => {
    values += 1;
    if (values > MAX_SOURCE_VALUES) {
      return `Source data must contain ${MAX_SOURCE_VALUES} values or fewer.`;
    }
    if (depth > MAX_JSON_DEPTH) {
      return `Source data cannot be nested more than ${MAX_JSON_DEPTH} levels.`;
    }
    if (typeof value !== 'object' || value === null) return null;
    if (ancestors.has(value))
      return 'Source data cannot contain circular values.';
    ancestors.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      const error = visit(child, depth + 1);
      if (error) return error;
    }
    ancestors.delete(value);
    return null;
  };
  return visit(source, 0);
}

function transformValue(
  value: unknown,
  transform: WorkflowDataMapperTransform,
): unknown {
  switch (transform) {
    case 'copy':
      return value;
    case 'string':
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value);
      }
      throw new Error(
        'String conversion only accepts text, numbers or booleans.',
      );
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value !== 'string' || !STRICT_NUMBER.test(value.trim())) {
        throw new Error(
          'Number conversion needs a finite number or numeric string.',
        );
      }
      const numberValue = Number(value.trim());
      if (!Number.isFinite(numberValue)) {
        throw new Error(
          'Number conversion needs a finite number or numeric string.',
        );
      }
      return numberValue;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 1 || (typeof value === 'string' && value.trim() === '1')) {
        return true;
      }
      if (value === 0 || (typeof value === 'string' && value.trim() === '0')) {
        return false;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      throw new Error('Boolean conversion accepts true, false, 1 or 0 only.');
    case 'iso_date': {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error('ISO date conversion needs a non-empty date string.');
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error('The source value is not a valid date.');
      }
      return date.toISOString();
    }
    case 'trim':
    case 'lowercase':
    case 'uppercase':
      if (typeof value !== 'string') {
        throw new Error('Text normalization needs a string source value.');
      }
      if (transform === 'trim') return value.trim();
      return transform === 'lowercase'
        ? value.toLowerCase()
        : value.toUpperCase();
    case 'json_string':
      return JSON.stringify(value);
  }
}

function setTargetValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): boolean {
  const parts = getPathParts(path, true);
  if (!parts) return false;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (next === undefined) {
      cursor[part] = {};
    } else if (!isObjectRecord(next)) {
      return false;
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (Object.prototype.hasOwnProperty.call(cursor, leaf)) return false;
  cursor[leaf] = value;
  return true;
}

function targetConflicts(path: string, previousPaths: string[]): boolean {
  return previousPaths.some(
    (previous) =>
      previous === path ||
      previous.startsWith(`${path}.`) ||
      path.startsWith(`${previous}.`),
  );
}

/** Validate a persisted action's mapping configuration without needing sample event data. */
export function validateWorkflowDataMappings(input: unknown): string | null {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAX_MAPPINGS
  ) {
    return `Data mapping needs 1 to ${MAX_MAPPINGS} field mappings.`;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return 'Data mappings must contain valid JSON values.';
  }
  if (serialized.length > MAX_SOURCE_BYTES) {
    return `Data mapping configuration must be ${MAX_SOURCE_BYTES} characters or fewer.`;
  }

  const targets: string[] = [];
  for (const [index, item] of input.entries()) {
    if (!isObjectRecord(item))
      return `Data mapping ${index + 1} must be an object.`;
    if (
      typeof item.sourcePath !== 'string' ||
      !getPathParts(item.sourcePath, false)
    ) {
      return `Data mapping ${index + 1} has an invalid source path.`;
    }
    if (
      typeof item.targetPath !== 'string' ||
      !getPathParts(item.targetPath, true)
    ) {
      return `Data mapping ${index + 1} has an invalid target path.`;
    }
    if (
      item.transform !== undefined &&
      !WORKFLOW_DATA_MAPPER_TRANSFORMS.includes(
        item.transform as WorkflowDataMapperTransform,
      )
    ) {
      return `Data mapping ${index + 1} has an unsupported transformation.`;
    }
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      return `Data mapping ${index + 1} has an invalid required flag.`;
    }
    if (targetConflicts(item.targetPath, targets)) {
      return `Data mapping ${index + 1} duplicates or overlaps another target path.`;
    }
    targets.push(item.targetPath);
  }
  return null;
}

function cloneSafeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSafeJsonValue);
  if (!isObjectRecord(value)) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!FORBIDDEN_PATH_SEGMENTS.has(key))
      clone[key] = cloneSafeJsonValue(child);
  }
  return clone;
}

function mergeRecords(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = cloneSafeJsonValue(existing) as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (FORBIDDEN_PATH_SEGMENTS.has(key)) continue;
    const previous = merged[key];
    merged[key] =
      isObjectRecord(previous) && isObjectRecord(value)
        ? mergeRecords(previous, value)
        : cloneSafeJsonValue(value);
  }
  return merged;
}

/** Merge one action's mapped values with earlier workflow mappings, enforcing the persisted cap. */
export function mergeWorkflowMappedData(
  existing: unknown,
  incoming: Record<string, unknown>,
): Record<string, unknown> | null {
  const merged = mergeRecords(
    isObjectRecord(existing) ? existing : {},
    incoming,
  );
  const serialized = JSON.stringify(merged);
  return serialized.length <= MAX_SOURCE_BYTES ? merged : null;
}

/**
 * Deterministic, non-eval mapping preview for JSON property paths. It deliberately performs no
 * network access, persistence, currency conversion or arbitrary expression execution.
 */
export function previewWorkflowDataMapping(
  source: Record<string, unknown>,
  mappings: WorkflowDataMapping[],
): WorkflowDataMapperPreview {
  const mappedData: Record<string, unknown> = {};
  const errors: WorkflowDataMapperIssue[] = [];
  const warnings: WorkflowDataMapperIssue[] = [];
  const targetPaths: string[] = [];
  let mappedFields = 0;

  const sourceError = validateSourceSize(source);
  if (sourceError) {
    return {
      valid: false,
      mappedFields,
      mappedData,
      errors: [
        { path: 'source', code: 'source_invalid', message: sourceError },
      ],
      warnings,
    };
  }
  if (mappings.length > MAX_MAPPINGS) {
    return {
      valid: false,
      mappedFields,
      mappedData,
      errors: [
        {
          path: 'mappings',
          code: 'too_many_mappings',
          message: `A preview can contain at most ${MAX_MAPPINGS} mappings.`,
        },
      ],
      warnings,
    };
  }

  for (const [index, mapping] of mappings.entries()) {
    const issuePath = `mappings.${index}`;
    const sourceParts = getPathParts(mapping.sourcePath, false);
    const targetParts = getPathParts(mapping.targetPath, true);
    if (!sourceParts || !targetParts) {
      errors.push({
        path: issuePath,
        code: 'invalid_path',
        message:
          'Use safe dot-separated property paths. Array indexes are supported in source paths.',
      });
      continue;
    }
    if (targetConflicts(mapping.targetPath, targetPaths)) {
      errors.push({
        path: issuePath,
        code: 'duplicate_target',
        message:
          'Target paths cannot be duplicated or overwrite a parent or child path.',
      });
      continue;
    }
    const sourceValue = getSourceValue(source, mapping.sourcePath);
    const hasFallback = 'fallback' in mapping;
    if (!sourceValue.found && !hasFallback) {
      if (mapping.required !== false) {
        errors.push({
          path: mapping.targetPath,
          code: 'missing_required_source',
          message: `Required source value "${mapping.sourcePath}" was not found.`,
        });
      } else {
        warnings.push({
          path: mapping.targetPath,
          code: 'optional_source_missing',
          message: `Optional source value "${mapping.sourcePath}" was not found; the target was omitted.`,
        });
      }
      continue;
    }

    const transform = mapping.transform ?? 'copy';
    let mappedValue: unknown;
    try {
      mappedValue = transformValue(
        sourceValue.found ? sourceValue.value : mapping.fallback,
        transform,
      );
    } catch (error) {
      errors.push({
        path: mapping.targetPath,
        code: 'transform_failed',
        message:
          error instanceof Error
            ? error.message
            : 'The mapping could not be transformed.',
      });
      continue;
    }
    if (!setTargetValue(mappedData, mapping.targetPath, mappedValue)) {
      errors.push({
        path: mapping.targetPath,
        code: 'target_conflict',
        message: 'The target path conflicts with another mapping.',
      });
      continue;
    }
    targetPaths.push(mapping.targetPath);
    mappedFields += 1;
    if (!sourceValue.found) {
      warnings.push({
        path: mapping.targetPath,
        code: 'fallback_used',
        message:
          'The configured fallback value was used because the source value was missing.',
      });
    }
  }

  let outputBytes = 0;
  try {
    outputBytes = JSON.stringify(mappedData).length;
  } catch {
    errors.push({
      path: 'mappedData',
      code: 'output_invalid',
      message: 'The mapped result is not valid JSON data.',
    });
  }
  if (outputBytes > MAX_SOURCE_BYTES) {
    errors.push({
      path: 'mappedData',
      code: 'output_too_large',
      message: `Mapped output must be ${MAX_SOURCE_BYTES} characters or fewer.`,
    });
  }

  return {
    valid: errors.length === 0,
    mappedFields,
    mappedData,
    errors,
    warnings,
  };
}
