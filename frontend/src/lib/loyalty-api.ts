import { apiFetch } from "@/lib/api-client";

export type LoyaltyProgramType = "punch_card" | "tier";

export interface LoyaltyTier {
  name: string;
  minSpend: number;
}

export interface LoyaltyProgram {
  id: string;
  businessId: string;
  name: string;
  type: LoyaltyProgramType;
  stampsRequired: number;
  rewardDescription: string | null;
  tiers: LoyaltyTier[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyMember {
  id: string;
  programId: string;
  customerId: string;
  stampCount: number;
  redeemedCount: number;
  currentTier?: string | null;
  customer: { id: string; name: string; phone: string };
  createdAt: string;
}

/** GET /loyalty-programs */
export function fetchLoyaltyPrograms(): Promise<LoyaltyProgram[]> {
  return apiFetch<LoyaltyProgram[]>("/loyalty-programs");
}

export interface CreateLoyaltyProgramInput {
  name: string;
  type?: LoyaltyProgramType;
  stampsRequired?: number;
  rewardDescription?: string;
  tiers?: LoyaltyTier[];
}

/** POST /loyalty-programs */
export function createLoyaltyProgram(input: CreateLoyaltyProgramInput): Promise<LoyaltyProgram> {
  return apiFetch<LoyaltyProgram>("/loyalty-programs", { method: "POST", body: JSON.stringify(input) });
}

/** POST /loyalty-programs/:id/enroll — real, idempotent (re-enrolling an existing member is a no-op). */
export function enrollLoyaltyMember(programId: string, customerId: string): Promise<LoyaltyMember> {
  return apiFetch<LoyaltyMember>(`/loyalty-programs/${programId}/enroll`, {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

/** GET /loyalty-programs/:id/members */
export function fetchLoyaltyMembers(programId: string): Promise<LoyaltyMember[]> {
  return apiFetch<LoyaltyMember[]>(`/loyalty-programs/${programId}/members`);
}

/** POST /loyalty-members/:id/redeem — redeems the oldest `stampsRequired` unredeemed real stamps. */
export function redeemLoyaltyMember(memberId: string): Promise<LoyaltyMember> {
  return apiFetch<LoyaltyMember>(`/loyalty-members/${memberId}/redeem`, { method: "POST" });
}
