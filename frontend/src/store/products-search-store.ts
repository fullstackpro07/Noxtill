import { create } from "zustand";

/** The Products module header's live search box — read by the All Products catalog table
 * (name/SKU/category). */
interface ProductsSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useProductsSearchStore = create<ProductsSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
