export declare function signPayload<T extends object>(payload: T, secret: string): string;
export declare function verifyPayload<T extends object>(token: string, secret: string): T | null;
