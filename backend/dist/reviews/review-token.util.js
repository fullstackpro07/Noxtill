"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReviewToken = generateReviewToken;
const crypto_1 = require("crypto");
const TOKEN_BYTES = 16;
function generateReviewToken() {
    return (0, crypto_1.randomBytes)(TOKEN_BYTES).toString('hex');
}
//# sourceMappingURL=review-token.util.js.map