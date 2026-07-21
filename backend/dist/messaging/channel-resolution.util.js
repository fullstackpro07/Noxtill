"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveChannel = resolveChannel;
const prisma_1 = require("../../generated/prisma");
const FALLBACK_ORDER = [
    prisma_1.MessageChannel.whatsapp,
    prisma_1.MessageChannel.sms,
    prisma_1.MessageChannel.email,
];
function hasContactFor(channel, contact) {
    if (channel === prisma_1.MessageChannel.email)
        return !!contact.email;
    return !!contact.phone;
}
function resolveChannel(preferred, contact) {
    const order = [preferred, ...FALLBACK_ORDER.filter((c) => c !== preferred)];
    return order.find((channel) => hasContactFor(channel, contact));
}
//# sourceMappingURL=channel-resolution.util.js.map