"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeEqual = safeEqual;
exports.verifyMetaSignature = verifyMetaSignature;
exports.verifyTwilioSignature = verifyTwilioSignature;
const crypto_1 = require("crypto");
function safeEqual(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(bufA, bufB);
}
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
    if (!signatureHeader?.startsWith('sha256='))
        return false;
    const expected = (0, crypto_1.createHmac)('sha256', appSecret)
        .update(rawBody)
        .digest('hex');
    return safeEqual(signatureHeader.slice('sha256='.length), expected);
}
function verifyTwilioSignature(fullUrl, params, signatureHeader, authToken) {
    if (!signatureHeader)
        return false;
    const data = fullUrl +
        Object.keys(params)
            .sort()
            .map((key) => key + params[key])
            .join('');
    const expected = (0, crypto_1.createHmac)('sha1', authToken)
        .update(data, 'utf8')
        .digest('base64');
    return safeEqual(signatureHeader, expected);
}
//# sourceMappingURL=signature.util.js.map