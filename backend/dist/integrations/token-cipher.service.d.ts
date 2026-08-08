import { ConfigService } from '@nestjs/config';
export declare class TokenCipherService {
    private readonly config;
    constructor(config: ConfigService);
    private key;
    encrypt(plaintext: string): string;
    decrypt(stored: string): string;
}
