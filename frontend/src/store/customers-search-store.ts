import { create } from "zustand";

/** The Customers module header's live search box — read by whichever screen has a searchable
 * customer list (name, phone, email or tag). */
interface CustomersSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useCustomersSearchStore = create<CustomersSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
