export declare class BundleItemInputDto {
    productId: string;
    qty: number;
}
export declare class CreateBundleDto {
    name: string;
    sku?: string;
    sellingPrice: number;
    items: BundleItemInputDto[];
}
