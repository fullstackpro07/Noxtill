"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleOAuth2Connector = void 0;
const axios_1 = __importDefault(require("axios"));
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
class GoogleOAuth2Connector {
    config;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/integrations/${this.provider}/callback`;
    }
    authUrl(state) {
        const clientId = this.config.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: this.redirectUri(),
            response_type: 'code',
            scope: this.scope,
            access_type: 'offline',
            prompt: 'consent',
            state,
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
            client_id: this.config.get('GOOGLE_OAUTH_CLIENT_ID') ?? '',
            client_secret: this.config.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
            code,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri(),
        }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
        return this.mapTokenResponse(response.data);
    }
    async refreshToken(tokens) {
        if (!tokens.refreshToken) {
            throw new Error('No refresh token available for this connection');
        }
        const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
            client_id: this.config.get('GOOGLE_OAUTH_CLIENT_ID') ?? '',
            client_secret: this.config.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token',
        }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
        return {
            ...this.mapTokenResponse(response.data),
            refreshToken: tokens.refreshToken,
        };
    }
    async disconnect() {
    }
    mapTokenResponse(data) {
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        };
    }
}
exports.GoogleOAuth2Connector = GoogleOAuth2Connector;
//# sourceMappingURL=google-oauth2.connector.js.map