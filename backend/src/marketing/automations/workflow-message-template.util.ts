const WORKFLOW_MESSAGE_TOKEN =
  /\{\{\s*((?:[A-Za-z][A-Za-z0-9_]*)|(?:mappedData|variables)(?:\.[A-Za-z_][A-Za-z0-9_-]*)+)\s*\}\}/g;
const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

export interface WorkflowMessageTemplateFields {
  fields: string[];
  malformed: boolean;
}

export interface WorkflowMessageResolution {
  body: string | null;
  error: string | null;
  missingFields: string[];
}

export interface WorkflowCustomFieldValueResolution {
  value: string | number | null;
  error: string | null;
  missingFields: string[];
}

export function workflowMessageTemplateFields(
  template: string,
): WorkflowMessageTemplateFields {
  const fields = Array.from(
    template.matchAll(WORKFLOW_MESSAGE_TOKEN),
    ([, field]) => field,
  );
  const withoutTokens = template.replace(WORKFLOW_MESSAGE_TOKEN, '');

  return {
    fields: [...new Set(fields)],
    malformed: withoutTokens.includes('{{') || withoutTokens.includes('}}'),
  };
}

/** Read a template value without permitting inherited or prototype-sensitive property access. */
export function getWorkflowMessageTemplateValue(
  context: Record<string, unknown>,
  field: string,
): unknown {
  const namespace = field.startsWith('mappedData.')
    ? 'mappedData'
    : field.startsWith('variables.')
      ? 'variables'
      : null;
  if (!namespace) {
    return Object.prototype.hasOwnProperty.call(context, field)
      ? context[field]
      : undefined;
  }
  const parts = field.split('.').slice(1);
  if (parts.some((part) => FORBIDDEN_PATH_SEGMENTS.has(part))) return undefined;
  let value: unknown = context[namespace];
  for (const part of parts) {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(value, part)
    ) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function resolveWorkflowMessageTemplate(
  template: string,
  context: Record<string, unknown>,
): WorkflowMessageResolution {
  const parsed = workflowMessageTemplateFields(template);
  if (parsed.malformed) {
    return {
      body: null,
      error: 'Message template syntax is invalid. Use {{fieldName}}.',
      missingFields: [],
    };
  }

  const missingFields = parsed.fields.filter((field) => {
    const value = getWorkflowMessageTemplateValue(context, field);
    if (typeof value === 'string') return value.trim().length === 0;
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value !== 'number' && typeof value !== 'boolean')
    );
  });

  if (missingFields.length > 0) {
    return {
      body: null,
      error: `Message template is missing trigger values: ${missingFields.join(', ')}.`,
      missingFields,
    };
  }

  return {
    body: template.replace(WORKFLOW_MESSAGE_TOKEN, (_token, field: string) =>
      String(getWorkflowMessageTemplateValue(context, field)),
    ),
    error: null,
    missingFields: [],
  };
}

/** Resolve a CRM field value from event data, preserving a numeric source when the whole value
 * is one token. Mixed text remains text; the canonical field-type validator makes the final call.
 */
export function resolveWorkflowCustomFieldValue(
  value: string | number | null,
  context: Record<string, unknown>,
): WorkflowCustomFieldValueResolution {
  if (typeof value !== 'string') {
    return { value, error: null, missingFields: [] };
  }

  const parsed = workflowMessageTemplateFields(value);
  if (parsed.malformed) {
    return {
      value: null,
      error: 'Customer field template syntax is invalid. Use {{fieldName}}.',
      missingFields: [],
    };
  }

  const exactToken = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(
    value.trim(),
  );
  if (exactToken) {
    const field = exactToken[1];
    const source = getWorkflowMessageTemplateValue(context, field);
    if (
      source === undefined ||
      source === null ||
      (typeof source === 'string' && source.trim().length === 0) ||
      (typeof source === 'number' && !Number.isFinite(source)) ||
      (typeof source !== 'string' &&
        typeof source !== 'number' &&
        typeof source !== 'boolean')
    ) {
      return {
        value: null,
        error: `Customer field template is missing trigger value: ${field}.`,
        missingFields: [field],
      };
    }
    return {
      value: typeof source === 'boolean' ? String(source) : source,
      error: null,
      missingFields: [],
    };
  }

  const rendered = resolveWorkflowMessageTemplate(value, context);
  return {
    value: rendered.body,
    error: rendered.error,
    missingFields: rendered.missingFields,
  };
}
