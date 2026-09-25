"use client";

import { create } from "zustand";

export type DeliveryDrawer =
  | { type: "kpi"; key: string; label: string }
  | { type: "intel"; index: number }
  | { type: "rider"; riderId: string }
  | { type: "order"; deliveryId: string };

export type DeliveryModal = { type: "assign"; deliveryId: string } | { type: "fresh" } | { type: "add-rider" } | { type: "create-delivery" };

interface DeliveryStoreState {
  drawer: DeliveryDrawer | null;
  openDrawer: (d: DeliveryDrawer) => void;
  modal: DeliveryModal | null;
  openModal: (m: DeliveryModal) => void;
  closeAll: () => void;
  toast: string | null;
  flash: (message: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useDeliveryStore = create<DeliveryStoreState>((set) => ({
  drawer: null,
  openDrawer: (d) => set({ drawer: d, modal: null }),
  modal: null,
  openModal: (m) => set({ modal: m, drawer: null }),
  closeAll: () => set({ drawer: null, modal: null }),
  toast: null,
  flash: (message) => {
    set({ toast: message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2800);
  },
}));
