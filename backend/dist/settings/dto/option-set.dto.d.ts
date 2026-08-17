export declare class CreateOptionSetDto {
    setKey: string;
    label: string;
}
export declare class CreateOptionDto {
    value: string;
}
export declare class UpdateOptionDto {
    value?: string;
    hidden?: boolean;
}
export declare class ReorderOptionsDto {
    orderedIds: string[];
}
