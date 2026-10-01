/**
 * Macro conditions: `Field = Value` or `Field != Value`, joined with AND (or commas).
 * Fields: Category, Queue, Channel, Status, Priority, Branch, Tag. Empty / "Any ticket" = always.
 * The same grammar is mirrored in the frontend composer (hd-core.ts `macroMatches`).
 */
export const CONDITION_FIELDS = [
  'category',
  'queue',
  'channel',
  'status',
  'priority',
  'branch',
  'tag',
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export interface Condition {
  field: ConditionField;
  neg: boolean;
  value: string;
}

export interface ConditionTicket {
  category: string;
  queue: string | null;
  channel: string;
  status: string;
  priority: string;
  branch: string | null;
  tags: string[];
}

/** Parsed conditions, or an error message saying what's wrong. */
export function parseConditions(
  text: string,
): { ok: true; conds: Condition[] } | { ok: false; error: string } {
  const t = (text ?? '').trim();
  if (!t || /^any ticket$/i.test(t)) return { ok: true, conds: [] };
  const conds: Condition[] = [];
  for (const part of t
    .split(/\s+and\s+|,/i)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = /^([a-z]+)\s*(!=|=)\s*(.+)$/i.exec(part);
    const field = m?.[1].toLowerCase() as ConditionField | undefined;
    if (
      !m ||
      !field ||
      !(CONDITION_FIELDS as readonly string[]).includes(field)
    )
      return {
        ok: false,
        error: `Can’t read “${part}”. Use Field = Value (Category, Queue, Channel, Status, Priority, Branch or Tag), joined with AND.`,
      };
    conds.push({
      field,
      neg: m[2] === '!=',
      value: m[3].trim().replace(/^#/, ''),
    });
  }
  return { ok: true, conds };
}

export function conditionsMatch(
  conds: Condition[],
  t: ConditionTicket,
): boolean {
  const eq = (a: string | null, b: string) =>
    (a ?? '').toLowerCase() === b.toLowerCase();
  return conds.every((c) => {
    const hit =
      c.field === 'tag'
        ? t.tags.some((g) => eq(g, c.value))
        : eq(
            c.field === 'queue'
              ? t.queue
              : c.field === 'branch'
                ? t.branch
                : t[c.field],
            c.value,
          );
    return c.neg ? !hit : hit;
  });
}
