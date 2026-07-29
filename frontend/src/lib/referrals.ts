export interface ReferralSettings {
  enabled: boolean;
  rewardType: "credit" | "discount";
  rewardAmount: number;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  rewardType: "credit",
  rewardAmount: 10,
};

/** Mock stats — real tracking is BE-062, live wiring is INT-010. */
export const REFERRAL_STATS = {
  totalReferred: 18,
  converted: 11,
  rewardsIssued: 9,
};
