export interface CustomShortcut {
  id: string;
  label: string;
  question: string;
  category: string;
}

/** Per-browser only — there's no backend model for a user's own chat shortcuts, so this follows
 * the same localStorage-preference convention already used elsewhere (e.g. profit widget prefs)
 * rather than fabricating a synced-across-devices feature that doesn't exist. */
const STORAGE_KEY = "noxtill.assistant.customShortcuts";
const CHANGE_EVENT = "noxtill:chat-shortcuts-changed";

export function loadCustomShortcuts(): CustomShortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomShortcut[]) : [];
  } catch {
    return [];
  }
}

export function addCustomShortcut(shortcut: Omit<CustomShortcut, "id">): void {
  const next = [...loadCustomShortcuts(), { ...shortcut, id: `cs-${Date.now()}` }];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* per-browser preference only — nothing to recover if storage is unavailable */
  }
}

/** Notifies other mounted components (e.g. a different tab of the assistant) that the list
 * changed, since the modal that writes it and the chat view that reads it live in separate
 * parts of the tree (layout vs. page) with no shared state. */
export function onCustomShortcutsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
