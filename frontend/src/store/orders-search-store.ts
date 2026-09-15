import { create } from "zustand";

/** The Orders module header's live search box — read by the All Orders table (order #, customer,
 * type) and the Receipts screen (order # or phone), matching the design's own cross-screen note
 * ("Search by order number or phone in the header search"). Reset on leaving the module. */
interface OrdersSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useOrdersSearchStore = create<OrdersSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
