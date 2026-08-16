export declare class CreateMembershipDto {
    customerId: string;
    planId: string;
    method: 'cash' | 'online';
    successUrl?: string;
    cancelUrl?: string;
}
