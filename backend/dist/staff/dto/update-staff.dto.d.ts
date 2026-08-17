export declare class UpdateStaffDto {
    role?: 'manager' | 'staff';
    commissionRule?: Record<string, unknown>;
    customRoleId?: string | null;
}
