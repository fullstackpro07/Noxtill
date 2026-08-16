export declare class VariantOptionInputDto {
    name: string;
    priceOverride?: number;
}
export declare class CreateVariantSetDto {
    name: string;
    options: VariantOptionInputDto[];
}
