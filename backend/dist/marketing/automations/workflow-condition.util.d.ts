export interface WorkflowCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number;
}
export declare function evaluateConditions(conditions: WorkflowCondition[], context: Record<string, unknown>): boolean;
