import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import { requestStepUp } from "@/store/step-up-store";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? "/api/v1"
    : process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5000/api/v1");

interface ApiErrorBody {
  error?: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string[]>;
  /** Structured context for typed errors, e.g. a usage limit's metric, remaining and remedies. */
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

interface ApiFetchOptions {
  /** Public endpoint: never triggers a refresh-and-retry or a redirect to /login on 401. */
  skipAuth?: boolean;
  /** Internal: marks a request as already having gone through one refresh-and-retry cycle. */
  isRetry?: boolean;
  /** Internal: already re-tried after a step-up / CSRF refresh. */
  isStepUpRetry?: boolean;
  /** Override X-Branch for just this one call, without touching the global branch-context store
   * (which drives what branch the rest of the app — e.g. Fast Sale — believes it's acting as).
   * Used by read-only cross-branch drill-downs (Branch 360, cross-branch tables) that pull another
   * branch's data via the same TenancyGuard mechanism the branch switcher uses, without silently
   * switching the whole app's operating context. TenancyGuard only honors it for the caller's own
   * business or a direct child, so this is safe to send unconditionally. */
  branchId?: string;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth security spec §8: the session is two HttpOnly cookies the browser sends itself
 * (`credentials: "include"`); JavaScript never sees a token. State-changing requests carry the
 * session's CSRF token in `X-CSRF-Token`.
 */
export function authHeaders(method = "GET", init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const { csrfToken } = useAuthStore.getState();
  if (csrfToken && !SAFE_METHODS.has(method.toUpperCase())) headers.set("X-CSRF-Token", csrfToken);
  const selectedBranchId = useBranchContextStore.getState().selectedBranchId;
  if (selectedBranchId && !headers.has("X-Branch")) headers.set("X-Branch", selectedBranchId);
  return headers;
}

/** CSRF header for raw `fetch` calls (uploads, downloads, streams) that don't go through apiFetch. */
export function csrfHeader(): Record<string, string> {
  const { csrfToken } = useAuthStore.getState();
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

/** Dedupes concurrent 401s during a page's initial burst of requests into a single refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

/** Rotates the refresh cookie (the server detects reuse). Resolves false when there's no session. */
export async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { csrfToken?: string };
      useAuthStore.getState().markAuthenticated({ csrfToken: data.csrfToken ?? null });
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Loads the CSRF token (and session state) after a reload — it is never persisted. */
let sessionInFlight: Promise<void> | null = null;
export async function loadSessionInfo(): Promise<void> {
  sessionInFlight ??= (async () => {
    try {
      const info = await apiFetch<{ csrfToken: string | null; mfaSetupRequired: boolean }>("/auth/session");
      useAuthStore.getState().markAuthenticated({ csrfToken: info.csrfToken, mfaSetupRequired: info.mfaSetupRequired });
    } catch {
      /* apiFetch already handled an ended session */
    }
  })().finally(() => {
    sessionInFlight = null;
  });
  return sessionInFlight;
}

function goTo(path: string) {
  if (typeof window !== "undefined" && window.location.pathname !== path) window.location.assign(path);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, options: ApiFetchOptions = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  // A write after a reload needs the CSRF token first.
  if (!options.skipAuth && !SAFE_METHODS.has(method) && !useAuthStore.getState().csrfToken && useAuthStore.getState().isAuthenticated) {
    await loadSessionInfo();
  }
  const headers = authHeaders(method, init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.branchId) headers.set("X-Branch", options.branchId);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: "include" });

  if (res.status === 401 && !options.skipAuth && !options.isRetry) {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, init, { ...options, isRetry: true });
    }
    useAuthStore.getState().clearSession();
    goTo("/login");
    throw new ApiError(401, "SESSION_EXPIRED", "Your session expired — please sign in again.");
  }

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // response had no JSON body
    }
    const err = body.error ?? { code: "UNKNOWN_ERROR", message: res.statusText || "Something went wrong" };

    if (res.status === 403 && !options.skipAuth && !options.isStepUpRetry) {
      if (err.code === "CSRF_INVALID") {
        useAuthStore.getState().setCsrfToken(null);
        await loadSessionInfo();
        return apiFetch<T>(path, init, { ...options, isStepUpRetry: true });
      }
      if (err.code === "STEP_UP_REQUIRED" && (await requestStepUp())) {
        return apiFetch<T>(path, init, { ...options, isStepUpRetry: true });
      }
      if (err.code === "MFA_SETUP_REQUIRED") {
        useAuthStore.getState().setMfaSetupRequired(true);
        goTo("/setup-mfa");
      }
      if (err.code === "EMAIL_NOT_VERIFIED") goTo("/check-email");
    }
    throw new ApiError(res.status, err.code, err.message, err.fields, err.details);
  }

  if (res.status === 204) return undefined as T;

  // Express's res.send(null) — what a Nest controller triggers by returning a bare `null`
  // (e.g. "no open shift") — sends an empty 200 body with no Content-Type, not JSON `null`.
  // res.json() throws on that empty body, so read as text first and only parse if non-empty.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
