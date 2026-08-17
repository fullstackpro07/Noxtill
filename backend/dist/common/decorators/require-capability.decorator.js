"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireCapability = exports.CAPABILITY_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.CAPABILITY_KEY = 'capability';
const RequireCapability = (capability) => (0, common_1.SetMetadata)(exports.CAPABILITY_KEY, capability);
exports.RequireCapability = RequireCapability;
//# sourceMappingURL=require-capability.decorator.js.map