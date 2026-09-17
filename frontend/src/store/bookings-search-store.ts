import { create } from "zustand";

/** The Bookings module header's live search box — read by whichever screen has a searchable list
 * (customer name/phone/service). */
interface BookingsSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useBookingsSearchStore = create<BookingsSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
