import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OnboardingData {
  businessTypeKey: string | null;
  businessTypeLabel: string | null;
  businessName: string;
  businessPhone: string;
  address: string;
  brandColor: string;
  teamEmails: string[];
  messagingChannel: "whatsapp" | "sms" | "email" | null;
}

const EMPTY_DATA: OnboardingData = {
  businessTypeKey: null,
  businessTypeLabel: null,
  businessName: "",
  businessPhone: "",
  address: "",
  brandColor: "#0C4B3B",
  teamEmails: [],
  messagingChannel: null,
};

interface OnboardingState {
  step: number;
  data: OnboardingData;
  setStep: (step: number) => void;
  updateData: (patch: Partial<OnboardingData>) => void;
  reset: () => void;
}

/** Persisted (FE-006 "resumable") — reloading mid-setup lands back on the same step with the same data. */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 0,
      data: EMPTY_DATA,
      setStep: (step) => set({ step }),
      updateData: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
      reset: () => set({ step: 0, data: EMPTY_DATA }),
    }),
    { name: "noxtill-onboarding" },
  ),
);
