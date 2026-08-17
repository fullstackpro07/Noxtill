export declare class CreateCouponDto {
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
    usageLimit?: number;
    usageLimitPerCustomer?: number;
    startsAt?: string;
    expiresAt?: string;
}
export declare class UpdateCouponDto {
    value?: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
    usageLimit?: number;
    usageLimitPerCustomer?: number;
    expiresAt?: string;
    active?: boolean;
}
