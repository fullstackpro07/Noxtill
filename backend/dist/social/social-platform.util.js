"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSocialPlatform = parseSocialPlatform;
const common_1 = require("@nestjs/common");
const prisma_1 = require("../../generated/prisma");
function parseSocialPlatform(value) {
    if (!Object.values(prisma_1.SocialPlatform).includes(value)) {
        throw new common_1.BadRequestException(`Unknown social platform: ${value}`);
    }
    return value;
}
//# sourceMappingURL=social-platform.util.js.map