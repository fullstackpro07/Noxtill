import { VariationDto } from './variation.dto';
export declare class CreateProductDto {
    kind: 'product' | 'service';
    name: string;
    category?: string;
    variations?: VariationDto[];
    costPrice: number;
    sellingPrice: number;
    stockQty?: number;
    lowStockThreshold?: number;
    durationMin?: number;
    active?: boolean;
}
