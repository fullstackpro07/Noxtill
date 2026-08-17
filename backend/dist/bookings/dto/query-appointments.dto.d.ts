export declare class QueryAppointmentsDto {
    from?: string;
    to?: string;
    staff?: string;
    status?: 'requested' | 'booked' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
}
