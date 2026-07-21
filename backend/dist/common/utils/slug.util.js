"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
const crypto_1 = require("crypto");
function slugify(input) {
    const base = input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const suffix = (0, crypto_1.randomBytes)(3).toString('hex');
    return `${base || 'business'}-${suffix}`;
}
//# sourceMappingURL=slug.util.js.map