import { HubCtx } from '../hub.core';
import { HubDeps } from './hub.deps';

export interface ConfigConflict {
  key: string;
  category: string;
  title: string;
  action: string;
}

/**
 * Settings that contradict each other, found by comparing the live records — never guessed.
 * Each is a case where Noxtill would have to pick one of two equally valid rules.
 */
export async function configConflicts(d: HubDeps, ctx: HubCtx): Promise<ConfigConflict[]> {
  const out: ConfigConflict[] = [];
  const [taxRules, bookingRules, creditRules] = await Promise.all([
    d.prisma.taxRule.findMany({ where: { businessId: ctx.businessId, active: true } }),
    d.prisma.reminderRule.findMany({ where: { businessId: ctx.businessId, active: true } }),
    d.prisma.creditReminderRule.findMany({ where: { businessId: ctx.businessId, active: true } }),
  ]);

  const tally = <T>(rows: T[], keyOf: (r: T) => string) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  };

  const taxDupes = tally(taxRules, (r) => r.category ?? '');
  if (taxDupes.length > 0) {
    const names = taxDupes.map((k) => (k === '' ? 'all products' : k));
    out.push({
      key: 'conflict-tax',
      category: 'tax',
      title: `More than one active tax rule applies to ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}, so the rate used is ambiguous`,
      action: 'Review tax rules',
    });
  }

  const bookingDupes = tally(bookingRules, (r) => `${r.offsetHours}|${r.channel ?? ''}`);
  if (bookingDupes.length > 0) {
    out.push({
      key: 'conflict-reminders',
      category: 'bookings',
      title: `${bookingDupes.length} booking reminder${bookingDupes.length === 1 ? ' is' : 's are'} set up twice with the same timing, so customers get duplicates`,
      action: 'Review reminders',
    });
  }

  const creditDupes = tally(creditRules, (r) => `${r.daysOverdueTrigger}|${r.channel ?? ''}`);
  if (creditDupes.length > 0) {
    out.push({
      key: 'conflict-credit',
      category: 'credit',
      title: `${creditDupes.length} credit reminder${creditDupes.length === 1 ? ' is' : 's are'} set up twice for the same day, so customers get duplicates`,
      action: 'Review reminder rules',
    });
  }
  return out;
}

const HOUR = 3_600_000;

export interface BackupSummary {
  last: { status: string; createdAt: Date; readyAt: Date | null; sizeBytes: number; recordsCount: number; errorMessage: string | null } | null;
  lastReady: { createdAt: Date; readyAt: Date | null; sizeBytes: number; recordsCount: number } | null;
  keptCount: number;
  failed30: number;
}

export async function backupSummary(d: HubDeps, businessId: string, now: Date): Promise<BackupSummary> {
  const jobs = await d.prisma.dataExportJob.findMany({ where: { businessId, trigger: 'backup' }, orderBy: { createdAt: 'desc' }, take: 400 });
  const ready = jobs.filter((j) => j.status === 'ready');
  return {
    last: jobs[0] ?? null,
    lastReady: ready[0] ?? null,
    keptCount: ready.length,
    failed30: jobs.filter((j) => j.status === 'failed' && now.getTime() - j.createdAt.getTime() < 30 * 24 * HOUR).length,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
