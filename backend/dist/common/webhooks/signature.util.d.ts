export declare function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean;
export declare function verifyTwilioSignature(fullUrl: string, params: Record<string, string>, signatureHeader: string | undefined, authToken: string): boolean;
