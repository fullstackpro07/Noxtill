"use client";

import { create } from "zustand";
import type { ConversationSort, ConversationView, RuleRow } from "@/lib/inbox-api";

export type InboxModal =
  | { type: "compose" }
  | { type: "assign"; conversationId: string; suggestedUserId?: string }
  | { type: "snooze"; conversationId: string }
  | { type: "create-customer"; conversationId: string }
  | { type: "add-tag"; conversationId: string; tags: string[] }
  | { type: "add-note"; conversationId: string; kind: "internal" | "customer" }
  | { type: "saved-reply-picker"; conversationId: string }
  | { type: "reply-editor"; replyId?: string; folder?: string; initial?: { title: string; folder: string; slug: string; body: string } }
  | { type: "new-folder" }
  | { type: "rule-editor"; rule?: RuleRow }
  | { type: "rule-history"; ruleId: string }
  | { type: "hours-editor" }
  | { type: "targets-editor" }
  | { type: "away-editor" }
  | { type: "order"; orderId: string }
  | { type: "filters" };

interface InboxStoreState {
  selectedId: string | null;
  select: (id: string | null) => void;
  view: ConversationView;
  setView: (v: ConversationView) => void;
  channel: string;
  setChannel: (c: string) => void;
  search: string;
  setSearch: (q: string) => void;
  sort: ConversationSort;
  setSort: (s: ConversationSort) => void;
  tag: string;
  setTag: (t: string) => void;
  assignee: string;
  setAssignee: (a: string) => void;
  /** Text staged into a composer from outside it (saved reply, "Edit first" on a draft). */
  composerText: { conversationId: string; text: string; savedReplyId?: string; draftId?: string } | null;
  stageComposer: (c: InboxStoreState["composerText"]) => void;
  modal: InboxModal | null;
  openModal: (m: InboxModal) => void;
  closeModal: () => void;
  toast: string | null;
  flash: (message: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useInboxStore = create<InboxStoreState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  view: "open",
  setView: (view) => set({ view }),
  channel: "all",
  setChannel: (channel) => set({ channel }),
  search: "",
  setSearch: (search) => set({ search }),
  sort: "newest",
  setSort: (sort) => set({ sort }),
  tag: "",
  setTag: (tag) => set({ tag }),
  assignee: "",
  setAssignee: (assignee) => set({ assignee }),
  composerText: null,
  stageComposer: (composerText) => set({ composerText }),
  modal: null,
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  toast: null,
  flash: (message) => {
    set({ toast: message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2800);
  },
}));
