import { ConfigService } from '@nestjs/config';
export declare class S3Service {
    private readonly config;
    private readonly client;
    private readonly bucket;
    constructor(config: ConfigService);
    upload(key: string, body: Buffer, contentType: string): Promise<void>;
    getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
    uploadAndSign(key: string, body: Buffer, contentType: string): Promise<string>;
}
