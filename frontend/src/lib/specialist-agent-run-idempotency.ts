import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
import { useBranchContextStore } from '@/store/branch-context-store';

type SpecialistAgentKey = 'inventory' | 'finance' | 'customer' | 'seo' | 'commerce';

const fallbackKeys = new Map<string, string>();

function getStoredKey(storageKey: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey) ?? fallbackKeys.get(storageKey) ?? null;
  } catch {
    return fallbackKeys.get(storageKey) ?? null;
  }
}

function saveStoredKey(storageKey: string, value: string) {
  fallbackKeys.set(storageKey, value);
  try {
    window.sessionStorage.setItem(storageKey, value);
  } catch {
    // In-memory reuse still protects retries until this page is closed.
  }
}

function clearStoredKey(storageKey: string, value: string) {
  if (fallbackKeys.get(storageKey) === value) fallbackKeys.delete(storageKey);
  try {
    if (window.sessionStorage.getItem(storageKey) === value) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // The key was removed from the in-memory fallback above.
  }
}

/** Reuses one opaque key for retries of the same operator/tenant/branch/input request. */
export async function postSpecialistAgentRun<T>(
  agent: SpecialistAgentKey,
  requestScope: unknown,
  send: (idempotencyKey?: string) => Promise<T>,
): Promise<T> {
  if (typeof window === 'undefined') return send();

  const auth = useAuthStore.getState();
  const branchId = useBranchContextStore.getState().selectedBranchId;
  const storageKey = `noxtill:specialist-run:${agent}:${encodeURIComponent(
    JSON.stringify([
      auth.business?.id ?? null,
      auth.user?.id ?? null,
      branchId,
      requestScope,
    ]),
  )}`;
  const idempotencyKey = getStoredKey(storageKey) ?? crypto.randomUUID();
  saveStoredKey(storageKey, idempotencyKey);

  try {
    const result = await send(idempotencyKey);
    clearStoredKey(storageKey, idempotencyKey);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      clearStoredKey(storageKey, idempotencyKey);
    }
    throw error;
  }
}
