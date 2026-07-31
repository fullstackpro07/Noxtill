import { create } from "zustand";

interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useAssistantStore = create<AssistantState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
