import { apiFetch } from "@/lib/api-client";
import { toLiveOrder, type CreateSaleInput, type LiveOrder, type RawOrder } from "@/lib/orders-api";

export interface ParsedVoiceSaleItem {
  productId: string | null;
  name: string;
  qty: number;
  matched: boolean;
}

export interface ParsedVoiceSale {
  id: string;
  transcript: string;
  items: ParsedVoiceSaleItem[];
  customerName: string | null;
  paymentMethodGuess: "cash" | "card" | "online" | "credit" | null;
}

/** Never writes a sale by itself — this only ever produces a staged, editable draft (see backend `VoiceSaleService` doc comment). */
export function parseVoiceSale(audio: Blob, filename: string): Promise<ParsedVoiceSale> {
  const formData = new FormData();
  formData.append("audio", audio, filename);
  return apiFetch<ParsedVoiceSale>("/voice/sales/parse", { method: "POST", body: formData });
}

/** The caller must hand back a real, possibly hand-corrected `CreateSaleInput` — this goes through the exact same validation as any other sale. */
export function confirmVoiceSale(id: string, input: CreateSaleInput): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/voice/sales/${id}/confirm`, { method: "POST", body: JSON.stringify(input) }).then(toLiveOrder);
}
