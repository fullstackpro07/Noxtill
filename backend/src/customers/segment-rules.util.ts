import { Prisma } from '@prisma/client';

/**
 * Segments, real rule builder (UPD-BE-098) — the persisted condition shape and its translation
 * into a real Prisma `where` clause. Kept deliberately small (one operator set that works across
 * every field type) rather than a per-field operator matrix — the rule builder UI only ever needs
 * these seven.
 */
export const SEGMENT_FIELDS = [
  'name',
  'phone',
  'email',
  'tags',
  'lifetimeSpend',
  'visitCount',
  'lastVisitAt',
  'createdAt',
  'consentMarketing',
  'optedOut',
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

export const SEGMENT_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

export interface SegmentCondition {
  field: SegmentField;
  operator: SegmentOperator;
  value: string | number | boolean;
}

export interface SegmentRules {
  combinator: 'AND' | 'OR';
  conditions: SegmentCondition[];
}

const STRING_FIELDS: SegmentField[] = ['name', 'phone', 'email'];
const NUMBER_FIELDS: SegmentField[] = ['lifetimeSpend', 'visitCount'];
const DATE_FIELDS: SegmentField[] = ['lastVisitAt', 'createdAt'];
const BOOLEAN_FIELDS: SegmentField[] = ['consentMarketing', 'optedOut'];

function coerceValue(field: SegmentField, value: SegmentCondition['value']) {
  if (NUMBER_FIELDS.includes(field)) return Number(value);
  if (DATE_FIELDS.includes(field)) return new Date(String(value));
  if (BOOLEAN_FIELDS.includes(field)) return Boolean(value);
  return String(value);
}

function conditionToWhere(
  condition: SegmentCondition,
): Prisma.CustomerWhereInput {
  const { field, operator } = condition;
  const value = coerceValue(field, condition.value);

  if (field === 'tags') {
    // MySQL migration: `tags` is a JSON array — membership uses the Json filter API, not `has`.
    return operator === 'not_contains'
      ? { NOT: { tags: { array_contains: [String(condition.value)] } } }
      : { tags: { array_contains: [String(condition.value)] } };
  }

  if (STRING_FIELDS.includes(field)) {
    if (operator === 'contains')
      return { [field]: { contains: String(value) } };
    if (operator === 'not_contains')
      return { NOT: { [field]: { contains: String(value) } } };
    if (operator === 'eq') return { [field]: { equals: value } };
    if (operator === 'neq') return { NOT: { [field]: { equals: value } } };
    // gt/gte/lt/lte on a string field falls back to equality — never silently mismatched.
    return { [field]: { equals: value } };
  }

  switch (operator) {
    case 'eq':
      return { [field]: value };
    case 'neq':
      return { NOT: { [field]: value } };
    case 'gt':
      return { [field]: { gt: value } };
    case 'gte':
      return { [field]: { gte: value } };
    case 'lt':
      return { [field]: { lt: value } };
    case 'lte':
      return { [field]: { lte: value } };
    default:
      return { [field]: value };
  }
}

export function rulesToWhere(rules: SegmentRules): Prisma.CustomerWhereInput {
  if (!rules.conditions || rules.conditions.length === 0) return {};
  const clauses = rules.conditions.map(conditionToWhere);
  return rules.combinator === 'OR' ? { OR: clauses } : { AND: clauses };
}
