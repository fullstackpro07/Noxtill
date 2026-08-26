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
