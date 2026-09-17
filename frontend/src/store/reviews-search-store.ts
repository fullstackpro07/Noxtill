import { create } from "zustand";

/** The Reviews module header's live search box — read by the All Reviews screen to filter the
 * merged inbox by review text or author name. */
interface ReviewsSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useReviewsSearchStore = create<ReviewsSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
