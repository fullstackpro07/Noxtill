import { create } from "zustand";

export interface AskRequest {
  kind: "text" | "confirm";
  title: string;
  description?: string;
  placeholder?: string;
  /** Text answers shorter than this are refused in the dialog (e.g. a required reason). */
  minLength?: number;
  confirmLabel?: string;
  tone?: "danger" | "default";
  resolve: (value: string | boolean | null) => void;
}

interface AskState {
  request: AskRequest | null;
  open: (request: AskRequest) => void;
  close: () => void;
}

export const useAskDialog = create<AskState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/**
 * In-page replacement for `window.prompt`. Resolves to the trimmed text, or null when cancelled.
 * Works in embedded/test browsers that don't support native prompt dialogs.
 */
export function askText(options: Omit<AskRequest, "kind" | "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    useAskDialog.getState().open({ ...options, kind: "text", resolve: (value) => resolve(typeof value === "string" ? value : null) });
  });
}

/** In-page replacement for `window.confirm`. Resolves to true only when confirmed. */
export function askConfirm(options: Omit<AskRequest, "kind" | "resolve" | "placeholder" | "minLength">): Promise<boolean> {
  return new Promise((resolve) => {
    useAskDialog.getState().open({ ...options, kind: "confirm", resolve: (value) => resolve(value === true) });
  });
}
