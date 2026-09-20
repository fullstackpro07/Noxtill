/**
 * What the diagnostic file contains. Kept next to the builder in `hub.service.ts` so the list the
 * owner reads before downloading is the list of sections that are actually generated.
 */
export const DIAGNOSTIC_FIELDS: { key: string; label: string }[] = [
  { key: 'generatedAt', label: 'Time generated' },
  { key: 'business', label: 'Business identifier, name, plan reference, timezone and currency' },
  { key: 'runtime', label: 'Server runtime and environment' },
  { key: 'database', label: 'Database status' },
  { key: 'storage', label: 'File storage type' },
  { key: 'queues', label: 'Background job counts' },
  { key: 'integrations', label: 'Connected services and their status' },
  { key: 'ai', label: 'Whether an AI provider is configured' },
  { key: 'recordCounts', label: 'Record totals' },
  { key: 'openIssues', label: 'Open configuration issues' },
];
