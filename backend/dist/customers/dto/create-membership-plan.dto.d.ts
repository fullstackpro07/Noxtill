export declare class CreateMembershipPlanDto {
    name: string;
    price: number;
    interval?: 'monthly' | 'yearly';
    benefits?: string;
    stripePriceId?: string;
}
