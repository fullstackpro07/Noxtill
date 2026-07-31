import { create } from "zustand";
import { persist } from "zustand/middleware";
import { localeByCode } from "@/lib/locales";

export type Theme = "light" | "dark" | "system";

interface UiState {
  theme: Theme;
  localeCode: string;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  setLocale: (code: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      localeCode: "en",
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setLocale: (localeCode) => set({ localeCode }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    { name: "noxtill-ui" },
  ),
);

/**
 * Applies the persisted theme + locale to <html> — call once from a client-only bootstrap component.
 * Layout direction is intentionally always "ltr": Urdu/Arabic translate the text but keep the LTR layout.
 */
export function applyDocumentPreferences(theme: Theme, localeCode: string) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedDark = theme === "dark" || (theme === "system" && systemDark);
  root.dataset.theme = resolvedDark ? "dark" : "light";

  const locale = localeByCode(localeCode);
  root.lang = locale.code;
  root.dir = "ltr";
}
