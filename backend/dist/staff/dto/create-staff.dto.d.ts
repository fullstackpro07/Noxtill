export declare class CreateStaffDto {
    name: string;
    email?: string;
    phone?: string;
    role: 'manager' | 'staff';
    commissionRule?: Record<string, unknown>;
}
