import { ConfigService } from '@nestjs/config';
export declare class ClaudeClient {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    complete(prompt: string, temperature?: number): Promise<string>;
}
