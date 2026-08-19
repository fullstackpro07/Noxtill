import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

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
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ApiFetchOptions {
  /** Skip attaching the bearer token — used for the signup/login/refresh calls themselves. */
  skipAuth?: boolean;
  /** Internal: marks a request as already having gone through one refresh-and-retry cycle. */
  isRetry?: boolean;
}

/** Dedupes concurrent 401s during a page's initial burst of requests into a single refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    useAuthStore.getState().setTokens(data);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, options: ApiFetchOptions = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (accessToken && !options.skipAuth) headers.set("Authorization", `Bearer ${accessToken}`);
  const selectedBranchId = useBranchContextStore.getState().selectedBranchId;
  if (selectedBranchId) headers.set("X-Branch", selectedBranchId);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && !options.skipAuth && !options.isRetry) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;

    if (refreshed) {
      return apiFetch<T>(path, init, { ...options, isRetry: true });
    }

    useAuthStore.getState().clearSession();
    if (typeof window !== "undefined") window.location.assign("/login");
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
    throw new ApiError(res.status, err.code, err.message, err.fields);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
