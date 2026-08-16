export declare class CreateShiftDto {
    staffUserId: string;
    startsAt: string;
    endsAt: string;
    note?: string;
}
export declare class UpdateShiftDto {
    startsAt?: string;
    endsAt?: string;
    status?: 'scheduled' | 'completed' | 'cancelled';
    note?: string;
}
export declare class RequestShiftSwapDto {
    coveringUserId?: string;
    reason?: string;
}
