export interface FileValidationRules {
    allowedMimeTypes: string[];
    maxSizeBytes: number;
}
export declare function validateUploadedFile(file: {
    buffer: Buffer;
    size: number;
    mimetype: string;
}, rules: FileValidationRules): Promise<void>;
