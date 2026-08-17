"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signPayload = signPayload;
exports.verifyPayload = verifyPayload;
const crypto_1 = require("crypto");
function signPayload(payload, secret) {
    const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = (0, crypto_1.createHmac)('sha256', secret)
        .update(json)
        .digest('base64url');
    return `${json}.${signature}`;
}
function verifyPayload(token, secret) {
    const [json, signature] = token.split('.');
    if (!json || !signature)
        return null;
    const expected = (0, crypto_1.createHmac)('sha256', secret)
        .update(json)
        .digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b))
        return null;
    try {
        return JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=signed-token.util.js.map