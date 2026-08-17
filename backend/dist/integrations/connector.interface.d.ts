import { IntegrationProvider } from '../../generated/prisma';
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
}
export interface MasterListingData {
    name: string;
    phone?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    categories: unknown;
    description?: string | null;
    hours: unknown;
}
export interface Connector {
    provider: IntegrationProvider;
    authUrl(state: string): string | null;
    handleCallback(code: string): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(tokens: OAuthTokens): Promise<unknown>;
    disconnect(): Promise<void>;
    pushListing?(tokens: OAuthTokens, listing: MasterListingData, meta: Record<string, unknown>): Promise<unknown>;
}
