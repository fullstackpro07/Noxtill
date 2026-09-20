import { IntegrationProvider } from '@prisma/client';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, row, RowDef, plural, relativeTime } from '../hub.core';
import { HubDeps, monthStart } from './hub.deps';
import { capabilityRow } from './access';
import { policyRow } from './policy-rows';
import { backupSummary, configConflicts, formatBytes } from './checks';

const ENTITY_LABELS: Record<string, string> = {
  setting: 'Settings',
  role_capability_override: 'Permissions',
  report_run: 'Reports',
  data_export: 'Data export',
  tax_filing: 'Tax',
  credit: 'Credit',
  customer: 'Customers',
  order: 'Sales',
  sale: 'Sales',
  return: 'Returns',
  customer_import: 'Import',
};

const storageCache = new Map<string, { at: number; value: Awaited<ReturnType<HubDeps['s3']['usageForBusiness']>> }>();

/** Walking storage is slow on a large bucket, so a business's figure is reused for a minute. */
async function storageUsage(d: HubDeps, businessId: string) {
  const hit = storageCache.get(businessId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = await d.s3.usageForBusiness(businessId);
  storageCache.set(businessId, { at: Date.now(), value });
  return value;
}

export function describeAudit(action: string, entity: string, after: unknown): string {
  const a = (after ?? {}) as { display?: string; label?: string };
  if (action.startsWith('setting.')) return `${a.label ?? 'Setting'} ${action === 'setting.reset' ? 'reset to default' : action === 'setting.restored' ? 'restored' : 'changed'}${a.display ? ` → ${a.display}` : ''}`;
  return `${action.replace(/[._]/g, ' ')}`.replace(/^./, (c) => c.toUpperCase());
}

export function governanceCategories(d: HubDeps): CategoryDef[] {
  const count = (key: string, label: string, description: string, fn: (businessId: string) => Promise<number>): RowDef =>
    row({ key, label, description, state: async (ctx) => ({ value: plural(await fn(ctx.businessId), 'record') }) });

  return [
    {
      key: 'data',
      label: 'Data Management',
      title: 'Data Management',
      icon: 'database',
      group: 'Governance',
      description: 'What Noxtill holds for this business and how fresh each connected source is.',
      affects: ['Every module', 'Reports', 'AI'],
      affectsNote: 'Data freshness decides what reports and AI can honestly claim about how current they are.',
      help: [
        'Record counts come from the modules that own the data, not a separate copy.',
        'Freshness is per source, so one delayed connection is visible rather than averaged away.',
        'Storage used counts the files kept under your own business folder (exports, reports, statements, invoices, product and media files). Files stored elsewhere are not included.',
      ],
      actions: [{ label: 'Export your data', icon: 'file-down', primary: true, href: '/reports/export', kind: 'export' }],
      groups: [
        {
          title: 'What Noxtill holds',
          hint: 'Owned by their modules',
          rows: [
            count('data-customers', 'Customers', 'Customer records with contact details and history.', (b) => d.prisma.customer.count({ where: { businessId: b } })),
            count('data-orders', 'Sales and orders', 'Transaction records.', (b) => d.prisma.order.count({ where: { businessId: b } })),
            count('data-products', 'Products and services', 'Catalog and stock records.', (b) => d.prisma.product.count({ where: { businessId: b } })),
            count('data-bookings', 'Bookings', 'Appointments and their history.', (b) => d.prisma.appointment.count({ where: { businessId: b } })),
            count('data-credit', 'Credit entries', 'Balances and payments.', (b) => d.prisma.creditEntry.count({ where: { businessId: b } })),
            count('data-messages', 'Messages', 'Customer messages sent.', (b) => d.prisma.message.count({ where: { businessId: b } })),
            count('data-team', 'Team members', 'People with access to this business.', (b) => d.prisma.businessUser.count({ where: { businessId: b } })),
            row({
              key: 'data-storage',
              label: 'Storage used',
              description: 'Space taken by the files kept for this business: exports, reports, statements, invoices, and product and media files.',
              state: async (ctx) => {
                const u = await storageUsage(d, ctx.businessId);
                if (u.objects === 0) return { value: 'No files stored' };
                const top = u.areas.slice(0, 3).map((a) => `${a.area} ${formatBytes(a.bytes)}`).join(' · ');
                return { value: `${u.truncated ? 'At least ' : ''}${formatBytes(u.bytes)} in ${plural(u.objects, 'file')}`, effective: top || null };
              },
            }),
          ],
        },
        {
          title: 'Freshness and quality',
          hint: 'Per source, not averaged',
          dynamicRows: async (ctx) => {
            const ints = await d.prisma.integration.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } }, orderBy: { provider: 'asc' } });
            const rows: RowDef[] = ints.map((i) =>
              row({ key: `fresh:${i.provider}`, label: i.provider.replace(/_/g, ' '), description: i.status === 'needs_attention' ? 'Authorisation needs attention, so this source is not syncing.' : 'When this source last synchronised.', risk: i.status === 'needs_attention' ? 'High' : 'Low', state: () => ({ value: i.status === 'needs_attention' ? 'Needs attention' : i.lastSyncAt ? relativeTime(i.lastSyncAt, ctx.now) : 'Never synced', tone: i.status === 'needs_attention' ? 'amber' : 'neutral' }) }),
            );
            const [warn, failedImports] = await Promise.all([
              d.prisma.reportRun.count({ where: { businessId: ctx.businessId, createdAt: { gte: monthStart(ctx.now) }, validationStatus: { in: ['warning', 'critical'] } } }),
              d.prisma.importBatch.count({ where: { businessId: ctx.businessId, status: 'failed' } }),
            ]);
            rows.push(row({ key: 'quality-reports', label: 'Reports with data warnings', description: 'Reports this month that listed excluded records or failed reconciliation.', link: { label: 'Open Reports', href: '/reports' }, state: () => ({ value: warn ? `${warn} this month` : 'None', tone: warn ? 'amber' : 'green' }) }));
            rows.push(row({ key: 'quality-imports', label: 'Failed imports', description: 'Imports that failed and did not write anything.', state: () => ({ value: failedImports ? `${failedImports}` : 'None', tone: failedImports ? 'amber' : 'green' }) }));
            return rows;
          },
          footer: 'Data quality problems are reported, never corrected by inference.',
        },
      ],
    },
    {
      key: 'importexport',
      label: 'Import & Export',
      title: 'Import & Export',
      icon: 'file-up',
      group: 'Governance',
      description: 'Bringing data in and taking it out. Exports are logged; imports never write before you confirm.',
      affects: ['Products', 'Customers', 'Every module'],
      affectsNote: 'An import never writes until you confirm the preview, and rows that fail are listed rather than partially imported.',
      help: [
        'Customer imports: upload, map columns, review, then confirm.',
        'Every data export records who ran it and whether it included sensitive columns.',
        'Export links expire 24 hours after the export is ready.',
      ],
      actions: [{ label: 'Export your data', icon: 'file-down', primary: true, href: '/reports/export', kind: 'export' }],
      groups: [
        {
          title: 'Import',
          hint: 'Never writes before you confirm',
          rows: [
            row({ key: 'imp-formats', label: 'Supported formats', description: 'What Noxtill can read.', state: () => ({ value: 'Customers: CSV · Excel · text · Word · photo. Products: CSV · Excel' }) }),
            row({ key: 'imp-size', label: 'Maximum file size', description: 'Largest customer import file.', state: () => ({ value: '10 MB' }) }),
            row({ key: 'imp-preview', label: 'Customer import confirmation', description: 'A customer import is previewed and only writes after you confirm it.', risk: 'High', state: () => ({ value: 'Confirm step', tone: 'green' }) }),
            row({ key: 'imp-rollback', label: 'Undo a completed import', description: 'Reversing an import after it has been confirmed.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
            row({
              key: 'imp-recent',
              label: 'Imports',
              description: 'Imports run for this business.',
              state: async (ctx) => {
                const [done, failed] = await Promise.all([d.prisma.importBatch.count({ where: { businessId: ctx.businessId, status: 'completed' } }), d.prisma.importBatch.count({ where: { businessId: ctx.businessId, status: 'failed' } })]);
                return { value: `${done} completed · ${failed} failed`, tone: failed ? 'amber' : 'neutral' };
              },
            }),
          ],
        },
        {
          title: 'Export',
          hint: 'Always logged',
          rows: [
            row({ key: 'exp-formats', label: 'Formats', description: 'What you can export to.', state: () => ({ value: 'CSV · Excel · PDF' }) }),
            capabilityRow(d, { key: CAPABILITIES.EXPORTS_GENERATE, label: 'Who may export', description: 'Who may run data exports.', impact: 'Export permission lets a role take financial and customer data outside Noxtill. Every data export is logged.' }),
            row({ key: 'exp-expiry', label: 'Link expiry', description: 'How long a secure download link stays valid.', risk: 'High', state: () => ({ value: '24 hours' }) }),
            row({
              key: 'exp-recent',
              label: 'Data exports',
              description: 'Exports requested in the last 30 days.',
              link: { label: 'Open Export Your Data', href: '/reports/export' },
              state: async (ctx) => ({ value: plural(await d.prisma.dataExportJob.count({ where: { businessId: ctx.businessId, trigger: 'manual', createdAt: { gte: new Date(ctx.now.getTime() - 30 * 86_400_000) } } }), 'export') }),
            }),
          ],
        },
      ],
    },
    {
      key: 'backup',
      label: 'Backup & Recovery',
      title: 'Backup & Recovery',
      icon: 'hard-drive-download',
      group: 'Governance',
      description: 'Automatic backups of your business records, how long they are kept, and their real status.',
      affects: ['Every module'],
      affectsNote: 'A backup is a portable copy of your records that you can download. Noxtill does not restore a backup for you.',
      help: [
        'A backup is a full export of your customers, sales, products, stock, credit and expenses, taken once a day while automatic backup is on.',
        'Backups older than the retention period are deleted, files and records both.',
        'A failed backup is shown as failed. Nothing here reports success it did not measure.',
        'There is no in-app restore. To recover data, download a backup and re-import what you need.',
      ],
      actions: [{ label: 'Export your data', icon: 'file-down', href: '/reports/export', kind: 'export' }, { label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Backup',
          hint: 'Real status only',
          footer: 'Backups are stored where your files are stored (see System Health). Noxtill does not manage encryption of that storage.',
          rows: [
            policyRow(d, {
              key: 'backup-enabled',
              policy: 'backup.enabled',
              kind: 'toggle',
              label: 'Automatic backup',
              description: 'Take a full backup of your records once a day.',
              risk: 'High',
              impact: 'A backup contains customer contact details and financial records, so it is stored like any other export and only the owner can download it.',
              on: { text: 'On · daily', tone: 'green' },
              off: { text: 'Off', tone: 'amber' },
            }),
            row({
              key: 'backup-last',
              label: 'Last backup',
              description: 'The most recent backup, and whether it finished.',
              state: async (ctx) => {
                const s = await backupSummary(d, ctx.businessId, ctx.now);
                if (!s.last) return { value: 'None yet', tone: 'neutral' };
                if (s.last.status === 'failed') return { value: `Failed ${relativeTime(s.last.createdAt, ctx.now)}`, tone: 'red', effective: s.last.errorMessage };
                if (s.last.status === 'ready') return { value: `${relativeTime(s.last.readyAt ?? s.last.createdAt, ctx.now)} · succeeded`, tone: 'green' };
                return { value: 'Running now', tone: 'blue' };
              },
            }),
            row({
              key: 'backup-size',
              label: 'Latest backup size',
              description: 'Size and record count of the most recent finished backup.',
              state: async (ctx) => {
                const s = await backupSummary(d, ctx.businessId, ctx.now);
                return s.lastReady ? { value: `${formatBytes(s.lastReady.sizeBytes)} · ${plural(s.lastReady.recordsCount, 'record')}` } : { value: 'No finished backup' };
              },
            }),
            policyRow(d, {
              key: 'backup-retention',
              policy: 'backup.retentionDays',
              kind: 'number',
              label: 'Retention',
              description: 'How long backups are kept before they are deleted.',
              risk: 'Medium',
              unit: 'days',
              format: (n) => `${n} day${n === 1 ? '' : 's'}`,
              step: 1,
            }),
            row({
              key: 'backup-kept',
              label: 'Backups kept',
              description: 'Finished backups you can still download.',
              state: async (ctx) => ({ value: plural((await backupSummary(d, ctx.businessId, ctx.now)).keptCount, 'backup') }),
            }),
            row({
              key: 'backup-failed',
              label: 'Failed backups',
              description: 'Backups that failed in the last 30 days.',
              risk: 'Medium',
              state: async (ctx) => {
                const n = (await backupSummary(d, ctx.businessId, ctx.now)).failed30;
                return { value: n === 0 ? 'None' : String(n), tone: n === 0 ? 'green' : 'red' };
              },
            }),
            row({
              key: 'backup-storage',
              label: 'Stored in',
              description: 'Where backup files are kept.',
              state: () => ({ value: d.s3.storageMode() === 's3' ? 'Object storage' : 'Local disk on this server', tone: d.s3.storageMode() === 's3' ? 'neutral' : 'amber' }),
            }),
          ],
        },
        {
          title: 'Recovery',
          hint: 'Copies you can download',
          rows: [
            row({
              key: 'backup-now',
              label: 'Back up now',
              description: 'Start a backup immediately, without waiting for the daily one.',
              requires: 'owner',
              state: () => ({ value: 'Owner only', control: { type: 'action', label: 'Back up now', actionKey: 'backup-now' } }),
            }),
            row({
              key: 'backup-download',
              label: 'Download the latest backup',
              description: 'A fresh download link for the newest finished backup.',
              risk: 'High',
              impact: 'The file contains customer contact details and financial records. The download is recorded in the audit log.',
              requires: 'owner',
              state: () => ({ value: 'Owner only', control: { type: 'action', label: 'Download', actionKey: 'backup-download-latest' } }),
            }),
            row({
              key: 'backup-restore',
              label: 'Restore',
              description: 'Noxtill has no in-app restore. A backup is a copy of your records to keep safe or re-import from; it does not replace your live data.',
              risk: 'High',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
            row({
              key: 'backup-export',
              label: 'Export a copy yourself',
              description: 'Choose exactly which modules to export, in CSV or Excel.',
              link: { label: 'Open Export Your Data', href: '/reports/export' },
              state: () => ({ value: 'Available' }),
            }),
          ],
        },
      ],
    },
    {
      key: 'reports',
      label: 'Reports & Data',
      title: 'Reports & Data',
      icon: 'file-bar-chart',
      group: 'Governance',
      description: 'How reports are generated, delivered and protected.',
      affects: ['Reports', 'Exports'],
      affectsNote: 'Sensitive report rules are enforced server-side, so a restricted role cannot reach them by any route.',
      help: [
        'Secure report links expire 24 hours after they are generated.',
        'Regenerating a report creates a new version; the old one is kept.',
        'Sending a report to someone other than yourself is owner-only.',
      ],
      actions: [{ label: 'Open Reports', icon: 'external-link', primary: true, href: '/reports', kind: 'link' }],
      groups: [
        {
          title: 'Reports',
          hint: 'Measured now',
          rows: [
            row({
              key: 'rep-scheduled',
              label: 'Scheduled reports',
              description: 'Reports generated automatically.',
              link: { label: 'Open Scheduled Reports', href: '/reports/scheduled' },
              state: async (ctx) => {
                const [on, off] = await Promise.all([d.prisma.scheduledExport.count({ where: { businessId: ctx.businessId, reportKind: { not: null }, active: true } }), d.prisma.scheduledExport.count({ where: { businessId: ctx.businessId, reportKind: { not: null }, active: false } })]);
                return { value: `${on} on${off ? ` · ${off} paused` : ''}` };
              },
            }),
            row({
              key: 'rep-runs',
              label: 'Generated this month',
              description: 'Report runs this month, kept as versions.',
              state: async (ctx) => ({ value: plural(await d.prisma.reportRun.count({ where: { businessId: ctx.businessId, createdAt: { gte: monthStart(ctx.now) } } }), 'run') }),
            }),
            row({ key: 'rep-expiry', label: 'Link expiry', description: 'How long a secure report link stays valid.', risk: 'High', state: () => ({ value: '24 hours' }) }),
            row({ key: 'rep-versions', label: 'Version retention', description: 'Regenerating creates a new version alongside the old one.', state: () => ({ value: 'All versions kept' }) }),
            row({ key: 'rep-send', label: 'Sending to others', description: 'Sending a report to anyone but yourself.', risk: 'High', state: () => ({ value: 'Owner only', tone: 'green' }) }),
          ],
        },
        { title: 'Who can see reports', hint: 'Permission', rows: [capabilityRow(d, { key: CAPABILITIES.PROFIT_VIEW, label: 'Profit, tax and P&L reports', description: 'Who can open the profit-bearing reports.', impact: 'Exposes revenue, cost and margin.' })] },
      ],
    },
    {
      key: 'privacy',
      label: 'Privacy & Data',
      title: 'Privacy & Data',
      icon: 'lock-keyhole',
      group: 'Governance',
      description: 'Customer data requests, how long voice recordings are kept, and how you get your data out.',
      affects: ['Customers', 'Exports'],
      affectsNote: 'Erasure is irreversible. Archive keeps historical records intact and is offered first.',
      help: [
        'Your data is exportable at any time in open formats, with no request process.',
        'Noxtill does not claim your configuration makes you compliant with any regulation.',
        'Customer erasure and export are written to the audit log.',
      ],
      notice: { text: 'Noxtill does not claim that your configuration makes you compliant with any regulation. That determination is not something it can make.', icon: 'info' },
      actions: [{ label: 'Export everything', icon: 'file-down', primary: true, href: '/reports/export', kind: 'export' }, { label: 'Open privacy tools', icon: 'external-link', href: '/settings/tools/privacy', kind: 'link' }],
      groups: [
        {
          title: 'Customer data requests',
          hint: 'Owner only',
          rows: [
            row({
              key: 'priv-requests',
              label: 'Requests',
              description: 'Customer export and erasure requests.',
              link: { label: 'Open privacy tools', href: '/settings/tools/privacy' },
              state: async (ctx) => {
                const [open, done] = await Promise.all([d.prisma.dataSubjectRequest.count({ where: { businessId: ctx.businessId, status: { in: ['pending', 'in_progress'] } } }), d.prisma.dataSubjectRequest.count({ where: { businessId: ctx.businessId, status: 'fulfilled' } })]);
                return { value: `${open} open · ${done} fulfilled`, tone: open ? 'amber' : 'neutral' };
              },
            }),
            capabilityRow(d, { key: CAPABILITIES.GDPR_MANAGE, label: 'Handle privacy requests', description: 'Who may fulfil customer export and erasure requests.', impact: 'Can lead to permanent erasure of customer data.' }),
            capabilityRow(d, { key: CAPABILITIES.CUSTOMERS_ERASE, label: 'Erase a customer', description: 'Who may permanently erase a customer.', impact: 'Erasure is irreversible and breaks links on historical records.' }),
          ],
        },
        {
          title: 'Retention',
          hint: 'No compliance claim',
          rows: [
            row({ key: 'priv-voice', label: 'Voice recordings', description: 'Voice recordings are deleted automatically after this long.', state: () => ({ value: '90 days' }) }),
            row({ key: 'priv-other', label: 'Other records', description: 'Messages, archives and the audit log are kept until you delete them.', state: () => ({ value: 'No automatic deletion' }) }),
            row({ key: 'priv-compliance', label: 'Compliance', description: 'Noxtill does not certify your compliance with any regulation.', risk: 'High', state: () => ({ value: 'Not claimed', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'health',
      label: 'System Health',
      title: 'System Health',
      icon: 'activity',
      group: 'Governance',
      description: 'Platform and background job status — measured, not asserted.',
      affects: ['Reports', 'Exports', 'Automations', 'Notifications'],
      affectsNote: 'A failed background job explains a missing report or export better than any error message.',
      help: [
        'Job states are waiting, running, completed or failed — never a fabricated progress bar.',
        'A failed job keeps its error so you can see what actually went wrong.',
        'Noxtill does not display a green badge for something it cannot measure.',
      ],
      actions: [],
      groups: [
        {
          title: 'Platform',
          hint: 'Measured, not asserted',
          rows: [
            row({ key: 'hl-api', label: 'API', description: 'This request reached Noxtill.', state: () => ({ value: 'Responding', tone: 'green' }) }),
            row({
              key: 'hl-db',
              label: 'Database',
              description: 'Round trip to the database.',
              state: async () => {
                const t = Date.now();
                try {
                  await d.prisma.$queryRaw`SELECT 1`;
                  return { value: `Responding · ${Date.now() - t} ms`, tone: 'green' };
                } catch {
                  return { value: 'Not responding', tone: 'red' };
                }
              },
            }),
            row({
              key: 'hl-queues',
              label: 'Background jobs',
              description: 'Whether the job queue is running.',
              state: async () => {
                const s = await d.queueSnapshot();
                return { value: !s.configured ? 'Not configured' : !s.reachable ? 'Not reachable' : `${s.queues.length} queues`, tone: s.configured && s.reachable ? 'green' : 'amber' };
              },
            }),
            row({ key: 'hl-storage', label: 'File storage', description: 'Where generated files are stored.', state: () => ({ value: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? 'Object storage' : 'Local disk', tone: 'neutral' }) }),
            row({ key: 'hl-ai', label: 'AI provider', description: 'Whether an AI provider key is configured.', state: () => ({ value: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured', tone: process.env.ANTHROPIC_API_KEY ? 'green' : 'amber' }) }),
          ],
        },
        {
          title: 'Background jobs',
          hint: 'Failures keep their error',
          badge: async () => {
            const s = await d.queueSnapshot();
            const failed = s.queues.reduce((n, q) => n + q.failed, 0);
            return failed > 0 ? { text: `${failed} failed`, tone: 'amber' } : null;
          },
          dynamicRows: async () => {
            const s = await d.queueSnapshot();
            if (!s.configured || !s.reachable) return [row({ key: 'jobs-off', label: 'Job queue', description: s.configured ? 'The job queue (Redis) is configured but not reachable, so background jobs are not running.' : 'No queue is configured on this installation, so background jobs do not run.', risk: 'High', state: () => ({ value: s.configured ? 'Not reachable' : 'Not configured', tone: 'amber' }) })];
            const total = (k: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed') => s.queues.reduce((n, q) => n + q[k], 0);
            const rows: RowDef[] = [
              row({ key: 'jobs-waiting', label: 'Waiting', description: 'Jobs queued to run.', state: () => ({ value: `${total('waiting') + total('delayed')} jobs` }) }),
              row({ key: 'jobs-active', label: 'Running', description: 'Jobs executing now.', state: () => ({ value: `${total('active')} jobs` }) }),
              row({ key: 'jobs-done', label: 'Completed', description: 'Jobs finished and still on record.', state: () => ({ value: `${total('completed').toLocaleString('en-US')} jobs` }) }),
              row({ key: 'jobs-failed', label: 'Failed', description: 'Jobs that failed after all attempts and kept their error.', risk: 'Medium', state: () => ({ value: total('failed') ? `${total('failed')} jobs` : 'None', tone: total('failed') ? 'amber' : 'green' }) }),
            ];
            for (const q of s.queues.filter((x) => x.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 6)) {
              rows.push(row({ key: `jobs-q:${q.name}`, label: q.name, description: 'A queue with failed jobs.', risk: 'Medium', state: () => ({ value: `${q.failed} failed`, tone: 'amber' }) }));
            }
            return rows;
          },
          footer: 'Counts cover every background queue in this installation, not only this business.',
        },
        {
          title: 'Configuration checks',
          hint: 'Settings that contradict each other',
          rows: [
            row({
              key: 'hl-conflicts',
              label: 'Conflicting settings',
              description: 'Duplicate active tax rules for the same category, and reminders set up twice with the same timing.',
              risk: 'Medium',
              state: async (ctx) => {
                const found = await configConflicts(d, ctx);
                return { value: found.length === 0 ? 'None found' : `${found.length} found`, tone: found.length === 0 ? 'green' : 'amber', effective: found.map((f) => f.title).join(' · ') || null };
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'audit',
      label: 'Audit Log',
      title: 'Audit Log',
      icon: 'history',
      group: 'Governance',
      description: 'Recent changes recorded for this business: who, when and what.',
      affects: ['Settings', 'Security', 'Permissions'],
      affectsNote: 'The audit log is append-only. Entries cannot be edited or removed from the interface.',
      help: [
        'Settings changes, permission changes, exports and financial actions are recorded.',
        'Before and after values are stored for settings changes.',
        'IP address and device are not stored in the audit log.',
      ],
      actions: [{ label: 'Open full activity log', icon: 'external-link', href: '/activity', kind: 'link' }],
      groups: [
        {
          title: 'Recent entries',
          hint: 'Append-only',
          footer: 'Every entry records who, when and what. Entries cannot be edited or removed.',
          dynamicRows: async (ctx) => {
            const entries = await d.prisma.auditLog.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: 'desc' }, take: 25 });
            const users = await d.prisma.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
            const names = new Map(users.map((u) => [u.id, u.name]));
            if (entries.length === 0) return [row({ key: 'audit-none', label: 'Recent entries', description: 'Nothing has been recorded yet.', state: () => ({ value: 'Empty', tone: 'neutral' }) })];
            return entries.map((e) =>
              row({
                key: `audit:${e.id}`,
                label: describeAudit(e.action, e.entity, e.after),
                description: `${ENTITY_LABELS[e.entity] ?? e.entity.replace(/_/g, ' ')} · ${e.actorUserId ? (names.get(e.actorUserId) ?? 'Unknown user') : 'System'}`,
                risk: 'Low',
                state: () => ({ value: `${e.createdAt.toISOString().slice(0, 10)} ${e.createdAt.toISOString().slice(11, 16)} UTC` }),
              }),
            );
          },
        },
      ],
    },
  ];
}
