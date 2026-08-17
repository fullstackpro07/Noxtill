export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number;
}

/** Context values are always string/number/boolean (see `workflow-context.util.ts`) — never an object. */
function toComparableString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** All conditions must pass (AND) — a missing context field always fails the condition. */
export function evaluateConditions(
  conditions: WorkflowCondition[],
  context: Record<string, unknown>,
): boolean {
  return conditions.every((condition) => {
    const actual = context[condition.field];
    if (actual === undefined || actual === null) return false;

    switch (condition.operator) {
      case 'eq':
        return toComparableString(actual) === String(condition.value);
      case 'neq':
        return toComparableString(actual) !== String(condition.value);
      case 'gt':
        return Number(actual) > Number(condition.value);
      case 'gte':
        return Number(actual) >= Number(condition.value);
      case 'lt':
        return Number(actual) < Number(condition.value);
      case 'lte':
        return Number(actual) <= Number(condition.value);
      case 'contains':
        return toComparableString(actual)
          .toLowerCase()
          .includes(String(condition.value).toLowerCase());
      default:
        return false;
    }
  });
}
