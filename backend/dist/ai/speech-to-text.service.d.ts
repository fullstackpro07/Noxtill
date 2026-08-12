import { ConfigService } from '@nestjs/config';
export declare class SpeechToTextService {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    transcribe(audioBuffer: Buffer, mimeType: string, filename: string): Promise<string>;
}
