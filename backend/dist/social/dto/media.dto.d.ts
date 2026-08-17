export declare class GenerateMediaImageDto {
    prompt: string;
    tags?: string[];
}
export declare class UpdateMediaAssetDto {
    tags?: string[];
}
export declare const MEDIA_ASSET_TYPES: readonly ["image", "video"];
export declare class MediaAssetTypeQueryDto {
    type?: (typeof MEDIA_ASSET_TYPES)[number];
}
