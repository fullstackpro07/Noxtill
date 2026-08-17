export declare class LoyaltyTierDto {
    name: string;
    minSpend: number;
}
export declare class CreateLoyaltyProgramDto {
    name: string;
    type?: 'punch_card' | 'tier';
    stampsRequired?: number;
    rewardDescription?: string;
    tiers?: LoyaltyTierDto[];
}
