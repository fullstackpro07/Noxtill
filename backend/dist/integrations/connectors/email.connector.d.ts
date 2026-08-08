import { Connector, OAuthTokens } from '../connector.interface';
export declare class EmailConnector implements Connector {
    readonly provider: "email";
    authUrl(): null;
    handleCallback(): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(): Promise<unknown>;
    disconnect(): Promise<void>;
}
