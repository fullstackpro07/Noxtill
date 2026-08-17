"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBasedConnector = void 0;
class TokenBasedConnector {
    authUrl() {
        return null;
    }
    async handleCallback(token) {
        const accountInfo = await this.verifyToken(token);
        return { accessToken: token, ...accountInfo };
    }
    async refreshToken(tokens) {
        return tokens;
    }
    async disconnect() { }
}
exports.TokenBasedConnector = TokenBasedConnector;
//# sourceMappingURL=token-based.connector.js.map