import { create } from "zustand";

interface StepUpState {
  open: boolean;
  resolve: ((ok: boolean) => void) | null;
  ask: () => Promise<boolean>;
  finish: (ok: boolean) => void;
}

/**
 * Elevated actions (billing, payroll, exports) need a re-authentication within the last 10 minutes
 * (auth security spec §8.5). `apiFetch` calls `requestStepUp()` on STEP_UP_REQUIRED; the global
 * <StepUpDialog/> asks the user, and the original request is retried once on success.
 */
export const useStepUpStore = create<StepUpState>((set, get) => ({
  open: false,
  resolve: null,
  ask: () =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ open: true, resolve });
    }),
  finish: (ok) => {
    get().resolve?.(ok);
    set({ open: false, resolve: null });
  },
}));

export function requestStepUp(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return useStepUpStore.getState().ask();
}
