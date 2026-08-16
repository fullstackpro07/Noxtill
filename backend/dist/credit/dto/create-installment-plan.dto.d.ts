export declare class InstallmentLineDto {
    amount: number;
    dueDate: string;
}
export declare class CreateInstallmentPlanDto {
    totalAmount: number;
    installments: InstallmentLineDto[];
    note?: string;
}
