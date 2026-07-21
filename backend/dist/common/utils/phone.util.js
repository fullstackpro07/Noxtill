"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhoneE164 = normalizePhoneE164;
const libphonenumber_js_1 = require("libphonenumber-js");
function normalizePhoneE164(raw, defaultCountry) {
    const trimmed = raw.trim();
    if (!trimmed)
        return undefined;
    const region = defaultCountry && (0, libphonenumber_js_1.isSupportedCountry)(defaultCountry)
        ? defaultCountry
        : undefined;
    try {
        const parsed = (0, libphonenumber_js_1.parsePhoneNumberWithError)(trimmed, region);
        return parsed.isValid() ? parsed.number : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=phone.util.js.map