"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StandardOAuth2Connector = void 0;
const axios_1 = __importDefault(require("axios"));
class StandardOAuth2Connector {
    config;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/social/${this.oauth.redirectSegment}/callback`;
    }
    authUrl(state) {
        const params = new URLSearchParams({
            client_id: this.config.get(this.oauth.clientIdEnvKey) ?? '',
            redirect_uri: this.redirectUri(),
            scope: this.oauth.scope,
            state,
            response_type: 'code',
        });
        return `${this.oauth.authorizeUrl}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.post(this.oauth.tokenUrl, new URLSearchParams({
            client_id: this.config.get(this.oauth.clientIdEnvKey) ?? '',
            client_secret: this.config.get(this.oauth.clientSecretEnvKey) ?? '',
            redirect_uri: this.redirectUri(),
            grant_type: 'authorization_code',
            code,
        }));
        const tokens = this.mapTokenResponse(response.data);
        const accountInfo = await this.fetchAccountInfo(tokens);
        return { ...tokens, ...accountInfo };
    }
    async refreshToken(tokens) {
        const response = await axios_1.default.post(this.oauth.tokenUrl, new URLSearchParams({
            client_id: this.config.get(this.oauth.clientIdEnvKey) ?? '',
            client_secret: this.config.get(this.oauth.clientSecretEnvKey) ?? '',
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken ?? '',
        }));
        return this.mapTokenResponse(response.data);
    }
    async disconnect() {
    }
    mapTokenResponse(data) {
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                : undefined,
        };
    }
}
exports.StandardOAuth2Connector = StandardOAuth2Connector;
//# sourceMappingURL=standard-oauth2.connector.js.map