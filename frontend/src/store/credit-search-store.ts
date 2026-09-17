import { create } from "zustand";

/** The Credit module header's live search box — read by whichever screen has a searchable
 * customer/entry list (name or phone). */
interface CreditSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useCreditSearchStore = create<CreditSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
