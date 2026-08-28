import { apiFetch } from "@/lib/api-client";

export interface BookDemoInput {
  name: string;
  businessName: string;
  email: string;
  phone?: string;
  businessType?: string;
  message?: string;
  /** Honeypot — left blank by real visitors. */
  website?: string;
}

export function submitBookDemo(input: BookDemoInput): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/book-a-demo", { method: "POST", body: JSON.stringify(input) }, { skipAuth: true });
}
