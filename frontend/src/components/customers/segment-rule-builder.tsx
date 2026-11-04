"use client";

import { Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEGMENT_FIELDS, SEGMENT_OPERATORS, SEGMENT_FIELD_LABELS, SEGMENT_OPERATOR_LABELS, type SegmentRules, type SegmentCondition, type SegmentField, type SegmentOperator } from "@/lib/segments-api";

export function SegmentRuleBuilder({ rules, onChange, allowedFields }: { rules: SegmentRules; onChange: (rules: SegmentRules) => void; allowedFields?: readonly SegmentField[] }) {
  const fields = allowedFields ?? SEGMENT_FIELDS;
  function updateCondition(index: number, patch: Partial<SegmentCondition>) {
    onChange({ ...rules, conditions: rules.conditions.map((condition, i) => i === index ? { ...condition, ...patch } : condition) });
  }
  return <div className="flex flex-col gap-2.5">
    {rules.conditions.length > 1 && <Select aria-label="Rule combination" value={rules.combinator} onChange={(event) => onChange({ ...rules, combinator: event.target.value as "AND" | "OR" })} className="w-28"><option value="AND">Match ALL</option><option value="OR">Match ANY</option></Select>}
    {rules.conditions.map((condition, i) => {
      const bool = condition.field === "consentMarketing" || condition.field === "optedOut";
      const operators = allowedFields ? SEGMENT_OPERATORS.filter((op) => bool ? op === "eq" || op === "neq" : op !== "contains" && op !== "not_contains") : SEGMENT_OPERATORS;
      return <div key={i} className="flex flex-wrap items-center gap-1.5">
        <Select aria-label={`Rule ${i + 1} field`} value={condition.field} onChange={(event) => {
          const field = event.target.value as SegmentField;
          updateCondition(i, allowedFields ? { field, operator: "eq", value: field === "consentMarketing" || field === "optedOut" ? true : field === "visitCount" ? 0 : new Date().toISOString().slice(0, 10) } : { field });
        }} className="w-40">{fields.map((field) => <option key={field} value={field}>{SEGMENT_FIELD_LABELS[field]}</option>)}</Select>
        <Select aria-label={`Rule ${i + 1} operator`} value={condition.operator} onChange={(event) => updateCondition(i, { operator: event.target.value as SegmentOperator })} className="w-40">{operators.map((op) => <option key={op} value={op}>{SEGMENT_OPERATOR_LABELS[op]}</option>)}</Select>
        <Input aria-label={`Rule ${i + 1} value`} value={String(condition.value)} onChange={(event) => updateCondition(i, { value: event.target.value })} className="w-32" />
        {rules.conditions.length > 1 && <Button variant="ghost" size="sm" onClick={() => onChange({ ...rules, conditions: rules.conditions.filter((_, index) => i !== index) })} aria-label="Remove condition"><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>}
      </div>;
    })}
    <Button variant="ghost" size="sm" className="self-start" disabled={!!allowedFields && rules.conditions.length >= 12} onClick={() => onChange({ ...rules, conditions: [...rules.conditions, { field: allowedFields ? "visitCount" : "lifetimeSpend", operator: "gt", value: 0 }] })}><Plus className="h-3.5 w-3.5" aria-hidden />Add condition</Button>
  </div>;
}
