export interface SlotLockTx {
    $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): unknown;
    appointment: {
        findFirst(args: {
            where: Record<string, unknown>;
        }): Promise<unknown>;
    };
}
export declare function assertSlotAvailable(tx: SlotLockTx, params: {
    businessId: string;
    staffId?: string | null;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    excludeAppointmentId?: string;
}): Promise<void>;
