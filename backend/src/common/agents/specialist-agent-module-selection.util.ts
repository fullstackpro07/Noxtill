import type { Prisma } from '@prisma/client';

const SOURCE_SELECTION_VERSION = 1;

export const LEGACY_SPECIALIST_AGENT_SOURCE_MODULES: Readonly<
  Record<string, readonly string[]>
> = {
  inventory_intelligence: ['inventory', 'products', 'branches', 'customers'],
  financial_intelligence: [
    'profit',
    'orders',
    'products',
    'inventory',
    'integrations',
    'credit',
    'branches',
  ],
  customer_intelligence: [
    'customers',
    'orders',
    'bookings',
    'reviews',
    'unified-inbox',
    'deliveries',
    'profit',
    'credit',
    'receptionist',
    'branches',
  ],
  seo_autopilot: ['marketing', 'integrations'],
  autonomous_commerce: [
    'autonomous-commerce',
    'integrations',
    'products',
    'orders',
    'deliveries',
    'inventory',
  ],
  specialist_agent_orchestrator: [],
};

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the modules whose data was actually included in a saved run when that
 * run writes the versioned source-selection contract. Older rows return null so
 * callers can keep their conservative legacy policy.
 */
export function recordedSpecialistAgentSourceModules(
  output: Prisma.JsonValue,
): Set<string> | null {
  if (
    !isJsonObject(output) ||
    output.moduleSelectionVersion !== SOURCE_SELECTION_VERSION
  ) {
    return null;
  }
  const sources = output.moduleSources;
  if (!isJsonObject(sources)) return null;

  const modules = Object.entries(sources);
  if (
    !modules.length ||
    modules.some(([, state]) => state !== 'included' && state !== 'disabled')
  ) {
    return null;
  }
  return new Set(
    modules
      .filter(([, state]) => state === 'included')
      .map(([moduleKey]) => moduleKey),
  );
}

/**
 * A saved run can be opened only while every module whose data it included is
 * enabled. Legacy snapshots use the caller's conservative source list.
 */
export function specialistAgentRunDetailsHiddenByModuleSelection(
  output: Prisma.JsonValue,
  disabledModules: ReadonlySet<string>,
  legacySourceModules: readonly string[],
): boolean {
  const recordedSources = recordedSpecialistAgentSourceModules(output);
  const sourceModules = recordedSources ?? new Set(legacySourceModules);
  return [...sourceModules].some((moduleKey) => disabledModules.has(moduleKey));
}

export function legacySpecialistAgentSourceModules(
  agentKey: string,
): readonly string[] | null {
  return LEGACY_SPECIALIST_AGENT_SOURCE_MODULES[agentKey] ?? null;
}
